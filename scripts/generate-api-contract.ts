#!/usr/bin/env tsx
/**
 * Generate OpenAPI + frontend TS route types from the backend API registry.
 *
 * Output:
 * - generated/openapi.json
 * - generated/api-contract.ts
 *
 * Run with: pnpm run api:generate
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import chalk from "chalk";

// Ensure all route modules are loaded (they register themselves into apiRegistry via contract router)
import "../src/routes";
import "../src/individual-routes";

import { apiRegistry } from "../src/api-contract/registry";
import type { AnyAuthSpec, AuthSpec, RouteSpec } from "../src/api-contract/contract.types";
import { autoExtractExpressRoutes } from "../src/api-contract/auto-extract";
import type { TypeRef } from "../src/api-contract/type-ref";

const OUT_DIR = path.join(process.cwd(), "generated");
const OUT_OPENAPI = path.join(OUT_DIR, "openapi.json");
const OUT_TS_DIR = path.join(OUT_DIR, "api");
const OUT_TS_BASE_DIR = path.join(OUT_TS_DIR, "base");
const OUT_TS_FEATURE_DIR = path.join(OUT_TS_DIR, "features");
const OUT_TS_INDEX = path.join(OUT_TS_DIR, "index.ts");

const GENERATED_AT_REGEX = /^\/\/ Generated at: .*$/m;

function stripTimestamp(content: string): string {
  return content.replace(GENERATED_AT_REGEX, "// Generated at: <stripped>");
}

function writeIfChanged(filePath: string, content: string): boolean {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (stripTimestamp(existing) === stripTimestamp(content)) {
      return false;
    }
  }
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

type JsonSchema = any;

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(OUT_TS_DIR, { recursive: true });
  fs.mkdirSync(OUT_TS_BASE_DIR, { recursive: true });
  fs.mkdirSync(OUT_TS_FEATURE_DIR, { recursive: true });
}

function cleanupLegacyFlatRouteFiles() {
  // Older generator versions wrote `generated/api/routes.*.ts` into the api root.
  // We now write into `generated/api/base|features/` to keep things organized.
  try {
    const entries = fs.readdirSync(OUT_TS_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.startsWith("routes.") || !e.name.endsWith(".ts")) continue;
      // keep only root files we own explicitly
      if (e.name === "types.ts" || e.name === "index.ts" || e.name === "catalog.ts") continue;
      fs.unlinkSync(path.join(OUT_TS_DIR, e.name));
    }
  } catch {
    // best-effort
  }
}

function cleanupStaleGroupedRouteFiles(groupsIndex: { key: string; file: string; folder: "base" | "features" }[]) {
  // Remove stale `generated/api/base|features/routes.*.ts` files that are no longer produced by the generator.
  // This keeps the frontend from accidentally importing old auto-extracted groups (e.g. `routes.oauth.ts`).
  const keepBase = new Set(
    groupsIndex.filter((g) => g.folder === "base").map((g) => `${g.file}.ts`)
  );
  const keepFeatures = new Set(
    groupsIndex.filter((g) => g.folder === "features").map((g) => `${g.file}.ts`)
  );

  const cleanupDir = (dir: string, keep: Set<string>) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (!e.name.startsWith("routes.") || !e.name.endsWith(".ts")) continue;
        if (!keep.has(e.name)) fs.unlinkSync(path.join(dir, e.name));
      }
    } catch {
      // best-effort
    }
  };

  cleanupDir(OUT_TS_BASE_DIR, keepBase);
  cleanupDir(OUT_TS_FEATURE_DIR, keepFeatures);
}

function typeName(zodSchema: any): string | undefined {
  return zodSchema?._def?.typeName;
}

function unwrapEffects(schema: z.ZodTypeAny): z.ZodTypeAny {
  let cur: any = schema;
  while (cur && typeName(cur) === "ZodEffects") {
    cur = cur._def?.schema;
  }
  return cur;
}

function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const s: any = unwrapEffects(schema);
  const tn = typeName(s);

  if (!tn) return {};

  switch (tn) {
    case "ZodString": {
      const out: any = { type: "string" };
      const checks: any[] = s._def?.checks ?? [];
      for (const c of checks) {
        if (c.kind === "min") out.minLength = c.value;
        if (c.kind === "max") out.maxLength = c.value;
        if (c.kind === "regex") out.pattern = c.regex?.source;
        if (c.kind === "email") out.format = "email";
        if (c.kind === "url") out.format = "uri";
        if (c.kind === "datetime") out.format = "date-time";
      }
      return out;
    }
    case "ZodNumber": {
      const out: any = { type: "number" };
      const checks: any[] = s._def?.checks ?? [];
      for (const c of checks) {
        if (c.kind === "int") out.type = "integer";
        if (c.kind === "min") {
          if (c.inclusive === false) out.exclusiveMinimum = c.value;
          else out.minimum = c.value;
        }
        if (c.kind === "max") {
          if (c.inclusive === false) out.exclusiveMaximum = c.value;
          else out.maximum = c.value;
        }
        if (c.kind === "positive") out.exclusiveMinimum = 0;
        if (c.kind === "nonnegative") out.minimum = 0;
      }
      return out;
    }
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodNull":
      return { type: "null" };
    case "ZodAny":
    case "ZodUnknown":
      return {};
    case "ZodLiteral":
      return { const: s._def?.value };
    case "ZodEnum":
      return { type: "string", enum: s._def?.values ?? [] };
    case "ZodNativeEnum": {
      const values = Object.values(s._def?.values ?? {}).filter(
        (v) => typeof v === "string" || typeof v === "number"
      );
      return { enum: values };
    }
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema(s._def?.type) };
    case "ZodUnion":
      return { anyOf: (s._def?.options ?? []).map((o: any) => zodToJsonSchema(o)) };
    case "ZodObject": {
      const shape = s._def?.shape?.() ?? {};
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, val] of Object.entries(shape)) {
        let v: any = val;
        let isOptional = false;
        let isNullable = false;
        let defaultValue: any = undefined;

        while (v) {
          const t = typeName(v);
          if (t === "ZodOptional") {
            isOptional = true;
            v = v._def?.innerType;
            continue;
          }
          if (t === "ZodNullable") {
            isNullable = true;
            v = v._def?.innerType;
            continue;
          }
          if (t === "ZodDefault") {
            isOptional = true;
            defaultValue = v._def?.defaultValue?.();
            v = v._def?.innerType;
            continue;
          }
          if (t === "ZodEffects") {
            v = v._def?.schema;
            continue;
          }
          break;
        }

        const propSchema = zodToJsonSchema(v);
        if (defaultValue !== undefined) propSchema.default = defaultValue;

        if (isNullable) {
          properties[key] = { anyOf: [propSchema, { type: "null" }] };
        } else {
          properties[key] = propSchema;
        }
        if (!isOptional) required.push(key);
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }
    case "ZodRecord": {
      const valueType = s._def?.valueType;
      return {
        type: "object",
        additionalProperties: valueType ? zodToJsonSchema(valueType) : {},
      };
    }
    case "ZodOptional":
      return zodToJsonSchema(s._def?.innerType);
    case "ZodNullable":
      return { anyOf: [zodToJsonSchema(s._def?.innerType), { type: "null" }] };
    case "ZodDefault": {
      const inner = zodToJsonSchema(s._def?.innerType);
      try {
        inner.default = s._def?.defaultValue?.();
      } catch {}
      return inner;
    }
    default:
      return {};
  }
}

function isTypeRefName(value: any): value is { kind: "type_ref"; name: string } {
  return (
    value &&
    typeof value === "object" &&
    value.kind === "type_ref" &&
    typeof value.name === "string"
  );
}

function isTypeRefExpr(value: any): value is { kind: "type_ref"; expr: string; imports: string[] } {
  return (
    value &&
    typeof value === "object" &&
    value.kind === "type_ref" &&
    typeof value.expr === "string" &&
    Array.isArray(value.imports)
  );
}

function jsLiteral(v: any): string {
  return JSON.stringify(v);
}

function jsonSchemaToTs(schema: JsonSchema): string {
  if (!schema || typeof schema !== "object") return "any";

  if (schema.const !== undefined) return jsLiteral(schema.const);

  if (Array.isArray(schema.enum)) {
    if (schema.enum.length === 0) return "string";
    return schema.enum.map((v: any) => jsLiteral(v)).join(" | ");
  }

  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((s: any) => jsonSchemaToTs(s)).join(" | ") || "any";
  }

  if (schema.type === "string") return "string";
  if (schema.type === "number" || schema.type === "integer") return "number";
  if (schema.type === "boolean") return "boolean";
  if (schema.type === "null") return "null";

  if (schema.type === "array") {
    return `Array<${jsonSchemaToTs(schema.items ?? {})}>`;
  }

  if (schema.type === "object") {
    const props = schema.properties ?? {};
    const required = new Set<string>(schema.required ?? []);
    const hasProps = Object.keys(props).length > 0;

    if (!hasProps && schema.additionalProperties) {
      return `Record<string, ${jsonSchemaToTs(schema.additionalProperties)}>`;
    }

    const lines = Object.entries(props).map(([key, propSchema]: any) => {
      const opt = required.has(key) ? "" : "?";
      return `  ${key}${opt}: ${jsonSchemaToTs(propSchema)};`;
    });
    return `{\n${lines.join("\n")}\n}`;
  }

  return "any";
}

function toPascalCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

function openApiSecurity(auth: AnyAuthSpec): { security?: any[]; extensions?: Record<string, any> } {
  // Composite handling
  if (auth.type === "composite_and") {
    // AND => single security object with merged schemes
    const merged: Record<string, any> = {};
    const extensions: Record<string, any> = {};
    for (const item of auth.items) {
      const sec = openApiSecurity(item);
      if (sec.security) {
        // take first alternative; AND doesn't combine OR cleanly here (best effort)
        const first = sec.security[0] ?? {};
        Object.assign(merged, first);
      }
      if (sec.extensions) Object.assign(extensions, sec.extensions);
    }
    return {
      security: Object.keys(merged).length ? [merged] : undefined,
      extensions: Object.keys(extensions).length ? extensions : undefined,
    };
  }
  if (auth.type === "composite_or") {
    const alts: any[] = [];
    const extensions: Record<string, any> = {};
    for (const item of auth.items) {
      const sec = openApiSecurity(item);
      if (sec.security) alts.push(...sec.security);
      if (sec.extensions) Object.assign(extensions, sec.extensions);
    }
    return {
      security: alts.length ? alts : undefined,
      extensions: Object.keys(extensions).length ? extensions : undefined,
    };
  }

  switch (auth.type) {
    case "public":
      return {};
    case "x_api_key_http":
      return { security: [{ xApiKey: [] }], extensions: { "x-transport": "http" } };
    case "x_api_key_https":
      return { security: [{ xApiKey: [] }], extensions: { "x-transport": "https" } };
    case "cron_bearer_https":
      return { security: [{ cronJobBearer: [] }], extensions: { "x-transport": "https" } };
    case "frontend_bearer_http":
      return { security: [{ frontendBearer: [] }], extensions: { "x-transport": "http" } };
    case "frontend_permission_http":
      return {
        security: [{ frontendBearer: [] }],
        extensions: { "x-transport": "http", "x-permissions": [auth.permission] },
      };
    case "unified_bearer": {
      const alternatives: any[] = [];
      if (auth.allowOAuth2) alternatives.push({ oauth2Bearer: [] });
      if (auth.allowApiKey) alternatives.push({ companyApiKeyBearer: [] });
      if (auth.allowUserSession) alternatives.push({ frontendBearer: [] });
      const extensions: Record<string, any> = {
        "x-auth": {
          allowOAuth2: !!auth.allowOAuth2,
          allowApiKey: !!auth.allowApiKey,
          allowUserSession: !!auth.allowUserSession,
          requireRole: auth.requireRole ?? null,
        },
      };
      if (auth.scopes?.length) extensions["x-scopes"] = auth.scopes;
      return { security: alternatives.length ? alternatives : undefined, extensions };
    }
    default:
      return {};
  }
}

function buildOpenApiDoc(routes: RouteSpec[]) {
  const doc: any = {
    openapi: "3.1.0",
    info: {
      title: "node-bill API",
      version: "1.0.0",
    },
    paths: {},
    components: {
      securitySchemes: {
        xApiKey: { type: "apiKey", in: "header", name: "x-api-key" },
        cronJobBearer: { type: "http", scheme: "bearer", bearerFormat: "CRON_SECRET" },
        frontendBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        oauth2Bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        companyApiKeyBearer: { type: "http", scheme: "bearer", bearerFormat: "API_KEY" },
      },
    },
  };

  for (const r of routes) {
    const pathItem = (doc.paths[r.path] ??= {});
    const op: any = {
      operationId: r.operationId,
      tags: r.tags,
      summary: r.summary,
      description: r.description,
      responses: {},
    };

    // params/query
    const params: any[] = [];
    if (r.request?.params) {
      const schema = zodToJsonSchema(r.request.params);
      const props = schema.properties ?? {};
      for (const [name, s] of Object.entries(props)) {
        params.push({
          name,
          in: "path",
          required: true,
          schema: s,
        });
      }
    }
    if (r.request?.query) {
      const schema = zodToJsonSchema(r.request.query);
      const props = schema.properties ?? {};
      const required = new Set<string>(schema.required ?? []);
      for (const [name, s] of Object.entries(props)) {
        params.push({
          name,
          in: "query",
          required: required.has(name),
          schema: s,
        });
      }
    }
    if (params.length) op.parameters = params;

    // request body
    if (r.request?.body) {
      const bodySchema = zodToJsonSchema(r.request.body);
      op.requestBody = {
        required: true,
        content: {
          [r.request.bodyContentType ?? "application/json"]: {
            schema: bodySchema,
          },
        },
      };
    }

    // responses
    for (const resp of r.responses) {
      if (resp.kind === "binary") {
        op.responses[String(resp.status)] = {
          description: resp.description ?? "Binary response",
          content: {
            [resp.contentType]: {
              schema: { type: "string", format: "binary" },
            },
          },
        };
        continue;
      }

      const dataSchema =
        isTypeRefName((resp as any).data) || isTypeRefExpr((resp as any).data) ? {} : zodToJsonSchema((resp as any).data);

      if (resp.kind === "json_raw") {
        op.responses[String(resp.status)] = {
          description: resp.description ?? "JSON response",
          content: {
            "application/json": { schema: dataSchema },
          },
        };
      } else {
        const envelopeSchema = {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { anyOf: [{ type: "string" }, { type: "null" }] },
            data: { anyOf: [dataSchema, { type: "null" }] },
          },
          required: ["success", "data"],
          additionalProperties: false,
        };
        op.responses[String(resp.status)] = {
          description: resp.description ?? "JSON response",
          content: {
            "application/json": { schema: envelopeSchema },
          },
        };
      }
    }

    const sec = openApiSecurity(r.auth);
    if (sec.security) op.security = sec.security;
    if (sec.extensions) Object.assign(op, sec.extensions);

    pathItem[r.method.toLowerCase()] = op;
  }

  return doc;
}

function groupKeyForRoute(r: RouteSpec): string {
  const firstTag = r.tags?.[0];
  if (firstTag) return String(firstTag).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const seg = r.path.split("/").filter(Boolean)[0] ?? "api";
  return seg.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

type BuildGroupOptions = {
  /** import path from group file to generated/api/types */
  typesImportPath: string;
  /** import path from group file to generated/frontend-types */
  frontendTypesImportPath: string;
};

function buildFrontendGroupTs(group: string, routes: RouteSpec[], options: BuildGroupOptions) {
  const lines: string[] = [];

  lines.push(`// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY`);
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push(`// Run \`pnpm run api:generate\` to regenerate`);
  lines.push(``);

  // Collect type refs to import from generated/frontend-types.ts (one level up)
  const typeRefs = new Set<string>();
  for (const r of routes) {
    for (const resp of r.responses) {
      if (resp.kind !== "json" && resp.kind !== "json_raw") continue;
      if (isTypeRefName(resp.data)) typeRefs.add(resp.data.name);
      if (isTypeRefExpr(resp.data)) resp.data.imports.forEach((i: string) => typeRefs.add(i));
    }
  }
  if (typeRefs.size > 0) {
    lines.push(
      `import type { ${Array.from(typeRefs).sort().join(", ")} } from ${jsLiteral(
        options.frontendTypesImportPath
      )};`
    );
    lines.push(``);
  }

  // Per-route types
  for (const r of routes) {
    const base = toPascalCase(r.operationId);
    const source = (r as any).__source as "explicit" | "extracted" | undefined;
    const hasRequestSpec = !!r.request;
    const hasPathParams = r.path.includes(":");

    const notReady = (msg: string) =>
      `import(${jsLiteral(options.typesImportPath)}).ContractNotReady<${jsLiteral(msg)}>`;

    const paramsSchema = r.request?.params;
    const paramsTypeName = paramsSchema ? typeName(unwrapEffects(paramsSchema as any)) : undefined;
    const params =
      paramsSchema
        ? (paramsTypeName === "ZodAny" || paramsTypeName === "ZodUnknown"
          ? notReady('Params schema is too generic (any/unknown). Provide a concrete DTO schema.')
          : jsonSchemaToTs(zodToJsonSchema(paramsSchema)))
        : hasPathParams
          ? hasRequestSpec
            ? "undefined" // explicit contract says no typed params (rare, but explicit)
            : notReady("Params not typed yet. Add DTO + validate({ params }) to the route.")
          : "undefined";

    const querySchema = r.request?.query;
    const queryTypeName = querySchema ? typeName(unwrapEffects(querySchema as any)) : undefined;
    const query =
      querySchema
        ? (queryTypeName === "ZodAny" || queryTypeName === "ZodUnknown"
          ? notReady('Query schema is too generic (any/unknown). Provide a concrete DTO schema (or explicitly declare none).')
          : jsonSchemaToTs(zodToJsonSchema(querySchema)))
        : hasRequestSpec
          ? "undefined"
          : notReady("Query not typed yet. Add DTO + validate({ query }) to the route (or explicitly declare none).");

    const bodySchema = r.request?.body;
    const bodyTypeName = bodySchema ? typeName(unwrapEffects(bodySchema as any)) : undefined;
    const body =
      bodySchema
        ? (bodyTypeName === "ZodAny" || bodyTypeName === "ZodUnknown"
          ? notReady('Body schema is too generic (any/unknown). Provide a concrete DTO schema.')
          : jsonSchemaToTs(zodToJsonSchema(bodySchema)))
        : hasRequestSpec
          ? "undefined"
          : (r.method === "POST" || r.method === "PUT" || r.method === "PATCH")
            ? notReady("Body not typed yet. Add DTO + validate({ body }) or contract({ request: ... }) to the route.")
            : "undefined";

    // Prefer JSON envelope response, then raw JSON, then binary
    const jsonResp = r.responses.find((x) => x.kind === "json") as any;
    const jsonRawResp = r.responses.find((x) => x.kind === "json_raw") as any;
    const binaryResp = r.responses.find((x) => x.kind === "binary") as any;
    const respData = (() => {
      if (!jsonResp && !jsonRawResp) {
        if (binaryResp) {
          // Treat binary endpoints as raw (non-envelope) payloads.
          return "Blob";
        }
        return notReady("No JSON response declared. Add contract({ responses: [...] }).");
      }
      const resp = (jsonResp ?? jsonRawResp) as any;
      if (isTypeRefName(resp.data)) return resp.data.name;
      if (isTypeRefExpr(resp.data)) return resp.data.expr;

      const tn = typeName(unwrapEffects(resp.data));
      const isAnyLike = tn === "ZodAny" || tn === "ZodUnknown";
      if (isAnyLike) {
        return notReady(
          "Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data."
        );
      }
      return jsonSchemaToTs(zodToJsonSchema(resp.data));
    })();

    lines.push(`export type ${base}Params = ${params};`);
    lines.push(`export type ${base}Query = ${query};`);
    lines.push(`export type ${base}Body = ${body};`);
    lines.push(`export type ${base}ResponseData = ${respData};`);
    if (!jsonResp && !jsonRawResp && binaryResp) {
      lines.push(`export type ${base}Response = Blob;`);
    } else if (!jsonResp && jsonRawResp) {
      lines.push(`export type ${base}Response = ${base}ResponseData;`);
    } else {
      lines.push(
        `export type ${base}Response = import(${jsLiteral(options.typesImportPath)}).ApiEnvelope<${base}ResponseData>;`
      );
    }
    lines.push(``);
  }

  // Route map (runtime-usable in frontend)
  lines.push(`export const apiRoutes_${group} = {`);
  for (const r of routes) {
    const base = toPascalCase(r.operationId);
    lines.push(`  ${JSON.stringify(r.operationId)}: {`);
    lines.push(`    method: ${JSON.stringify(r.method)},`);
    lines.push(`    path: ${JSON.stringify(r.path)},`);
    lines.push(`    auth: ${jsLiteral(r.auth)},`);
    if (r.tags?.length || r.summary || r.description || (r as any)["x-validated"] || (r as any).request?.bodyContentType) {
      lines.push(`    meta: {`);
      if (r.tags?.length) lines.push(`      tags: ${JSON.stringify(r.tags)},`);
      if (r.summary) lines.push(`      summary: ${JSON.stringify(r.summary)},`);
      if (r.description) lines.push(`      description: ${JSON.stringify(r.description)},`);
      const ct = (r as any).request?.bodyContentType as string | undefined;
      if (ct) lines.push(`      bodyContentType: ${JSON.stringify(ct)},`);
      const xv = (r as any)["x-validated"] as any;
      if (xv) lines.push(`      validated: ${jsLiteral(xv)},`);
      lines.push(`    },`);
    }
    lines.push(`    types: null as unknown as {`);
    lines.push(`      params: ${base}Params;`);
    lines.push(`      query: ${base}Query;`);
    lines.push(`      body: ${base}Body;`);
    lines.push(`      response: ${base}Response;`);
    lines.push(`      responseData: ${base}ResponseData;`);
    lines.push(`    },`);
    lines.push(`  },`);
  }
  lines.push(`} as const;`);

  return lines.join("\n");
}

function buildFrontendTypesFile() {
  return [
    `// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY`,
    `// Generated at: ${new Date().toISOString()}`,
    `// Run \`pnpm run api:generate\` to regenerate`,
    ``,
    `export type ApiEnvelope<T> = {`,
    `  success: boolean;`,
    `  message?: string | null;`,
    `  data: T | null;`,
    `};`,
    ``,
    `/**`,
    ` * This type indicates that the backend contract is not fully typed for this route yet.`,
    ` * Do NOT use it as a real request/response type in the frontend.`,
    ` */`,
    `export type ContractNotReady<Message extends string> = {`,
    `  __CONTRACT_NOT_READY__: Message;`,
    `};`,
    ``,
  ].join("\n");
}

type GroupIndex = { key: string; file: string; folder: "base" | "features" };

function buildFrontendIndex(groups: GroupIndex[]) {
  const lines: string[] = [];
  lines.push(`// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY`);
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push(`// Run \`pnpm run api:generate\` to regenerate`);
  lines.push(``);
  lines.push(`export * from "./types";`);
  lines.push(`export * from "./catalog";`);
  for (const g of groups) {
    // IMPORTANT: no ".ts" extensions in TS import/export paths (TS5097)
    lines.push(`export * from "./${g.folder}/${g.file}";`);
  }
  lines.push(``);
  lines.push(`import type { ApiEnvelope } from "./types";`);
  for (const g of groups) {
    lines.push(`import { apiRoutes_${g.key} } from "./${g.folder}/${g.file}";`);
  }
  lines.push(``);
  lines.push(`export const apiRoutes = {`);
  for (const g of groups) {
    lines.push(`  ...apiRoutes_${g.key},`);
  }
  lines.push(`} as const;`);
  lines.push(``);
  lines.push(`export type ApiRouteKey = keyof typeof apiRoutes;`);
  lines.push(`export type ApiRoute<K extends ApiRouteKey> = (typeof apiRoutes)[K];`);
  lines.push(`export type ApiRequest<K extends ApiRouteKey> = ApiRoute<K>["types"];`);
  lines.push(`export type ApiResponse<K extends ApiRouteKey> = ApiRoute<K>["types"]["response"];`);
  lines.push(`export type ApiResponseData<K extends ApiRouteKey> = ApiRoute<K>["types"]["responseData"];`);
  lines.push(``);
  lines.push(`export type { ApiEnvelope };`);
  return lines.join("\n");
}

function readMountPrefixes(mountFile: string): string[] {
  const content = fs.readFileSync(mountFile, "utf-8");
  const re = /app\.use\(\s*["'`](\/[^"'`]+)["'`]\s*,/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    out.push(m[1].replace(/\/+$/, ""));
  }
  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
}

function normalizeKeySegment(seg: string) {
  return seg.toLowerCase().replace(/-/g, "_").replace(/[^a-z0-9_]+/g, "_");
}

function buildCatalogTs(basePrefixes: string[], featurePrefixes: string[], groups: GroupIndex[]) {
  const lines: string[] = [];
  lines.push(`// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY`);
  lines.push(`// Generated at: ${new Date().toISOString()}`);
  lines.push(`// Run \`pnpm run api:generate\` to regenerate`);
  lines.push(``);
  lines.push(`export type RouteGroup = { key: string; module: string };`);
  lines.push(``);
  lines.push(`export const apiMountPrefixes = {`);
  lines.push(`  base: ${JSON.stringify(basePrefixes, null, 2)},`);
  lines.push(`  features: ${JSON.stringify(featurePrefixes, null, 2)},`);
  lines.push(`} as const;`);
  lines.push(``);
  // Best-effort classification by prefix name contained in group key
  const baseGroups = groups
    .filter((g) => basePrefixes.some((p) => p.split("/").filter(Boolean)[0] === g.key))
    .map((g) => ({ key: g.key, module: `./${g.file}` }));
  const featureGroups = groups
    .filter((g) => featurePrefixes.some((p) => p.split("/").filter(Boolean)[0] === g.key))
    .map((g) => ({ key: g.key, module: `./${g.file}` }));

  lines.push(`export const apiGroups = {`);
  lines.push(`  base: ${JSON.stringify(baseGroups, null, 2)} as RouteGroup[],`);
  lines.push(`  features: ${JSON.stringify(featureGroups, null, 2)} as RouteGroup[],`);
  lines.push(
    `  all: ${JSON.stringify(
      groups.map((g) => ({ key: g.key, module: `./${g.folder}/${g.file}` })),
      null,
      2
    )} as RouteGroup[],`
  );
  lines.push(`} as const;`);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Hinweis:`); 
  lines.push(` * - Diese Klassifikation ist best-effort (Prefix->GroupKey).`); 
  lines.push(` * - Für exakte Zuordnung nutzt ihr am besten die Route-Pfade in openapi.json.`); 
  lines.push(` */`);
  lines.push(``);
  return lines.join("\n");
}

function countMatches(haystack: string, re: RegExp): number {
  if (!re.global) throw new Error("countMatches requires a global RegExp");
  let n = 0;
  for (const _ of haystack.matchAll(re)) n++;
  return n;
}

function computeGeneratedCoverage(dir: string) {
  const files: Array<{
    file: string;
    endpoints: number;
    missingPieces: number;
    extractedEndpoints: number;
  }> = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.startsWith("routes.") || !e.name.endsWith(".ts")) continue;
      const full = path.join(dir, e.name);
      const content = fs.readFileSync(full, "utf-8");
      const endpoints = countMatches(content, /method:\s*"/g);
      const missingPieces = countMatches(content, /ContractNotReady</g);
      const extractedEndpoints = countMatches(content, /"(GET|POST|PUT|PATCH|DELETE)__[^"]+"\s*:/g);
      files.push({ file: e.name, endpoints, missingPieces, extractedEndpoints });
    }
  } catch {
    // ignore
  }

  const endpoints = files.reduce((a, f) => a + f.endpoints, 0);
  const missingPieces = files.reduce((a, f) => a + f.missingPieces, 0);
  const extractedEndpoints = files.reduce((a, f) => a + f.extractedEndpoints, 0);
  const totalPieces = endpoints * 4;
  const coverage = totalPieces === 0 ? 1 : Math.max(0, Math.min(1, 1 - missingPieces / totalPieces));

  return { endpoints, missingPieces, extractedEndpoints, totalPieces, coverage, files };
}

function computeRuntimeValidationCoverage(
  merged: RouteSpec[],
  baseSegments: Set<string>,
  featureSegments: Set<string>
) {
  type Bucket = {
    endpointsExplicit: number;
    expectedPieces: number;
    validatedPieces: number;
    offenders: Array<{
      operationId: string;
      method: string;
      path: string;
      missing: ("params" | "query" | "body")[];
    }>;
  };

  const emptyBucket = (): Bucket => ({
    endpointsExplicit: 0,
    expectedPieces: 0,
    validatedPieces: 0,
    offenders: [],
  });

  const buckets: Record<"base" | "features", Bucket> = {
    base: emptyBucket(),
    features: emptyBucket(),
  };

  const getFolder = (r: RouteSpec): "base" | "features" => {
    const k = groupKeyForRoute(r);
    const normalizedKey = normalizeKeySegment(k);
    if (baseSegments.has(normalizedKey)) return "base";
    if (featureSegments.has(normalizedKey)) return "features";

    // Fallback: tag-key didn't match — try the route's actual mount segment.
    const pathSeg = normalizeKeySegment(r.path.split("/").filter(Boolean)[0] ?? "");
    if (pathSeg && baseSegments.has(pathSeg)) return "base";
    if (pathSeg && featureSegments.has(pathSeg)) return "features";
    return "features";
  };

  const parts: Array<"params" | "query" | "body"> = ["params", "query", "body"];

  for (const r of merged) {
    const src = (r as any).__source as "explicit" | "extracted" | undefined;
    if (src !== "explicit") continue;

    const folder = getFolder(r);
    const b = buckets[folder];
    b.endpointsExplicit++;

    const expected: ("params" | "query" | "body")[] = [];
    for (const p of parts) {
      if ((r as any).request?.[p]) expected.push(p);
    }
    if (!expected.length) continue;

    const validatedMeta = (r as any)["x-validated"] as { params?: boolean; query?: boolean; body?: boolean } | undefined;
    const missing = expected.filter((p) => !validatedMeta?.[p]);

    b.expectedPieces += expected.length;
    b.validatedPieces += expected.length - missing.length;

    if (missing.length) {
      b.offenders.push({
        operationId: r.operationId,
        method: (r as any).method,
        path: r.path,
        missing,
      });
    }
  }

  for (const k of Object.keys(buckets) as Array<keyof typeof buckets>) {
    buckets[k].offenders.sort((a, b) => b.missing.length - a.missing.length);
  }

  const pct = (b: Bucket) => (b.expectedPieces === 0 ? 1 : b.validatedPieces / b.expectedPieces);
  return {
    base: { ...buckets.base, coverage: pct(buckets.base) },
    features: { ...buckets.features, coverage: pct(buckets.features) },
  };
}

function renderProgressBar(pct: number, width: number) {
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.round(clamped * width);
  const empty = Math.max(0, width - filled);
  const bar = "█".repeat(filled) + "░".repeat(empty);

  const colored =
    clamped >= 0.9 ? chalk.green(bar) : clamped >= 0.75 ? chalk.yellow(bar) : chalk.red(bar);
  return colored;
}

function printCoverageReport(opts: {
  merged: RouteSpec[];
  baseSegments: Set<string>;
  featureSegments: Set<string>;
}) {
  const base = computeGeneratedCoverage(OUT_TS_BASE_DIR);
  const features = computeGeneratedCoverage(OUT_TS_FEATURE_DIR);
  const runtime = computeRuntimeValidationCoverage(opts.merged, opts.baseSegments, opts.featureSegments);

  const printOne = (
    label: string,
    c: ReturnType<typeof computeGeneratedCoverage>,
    rv: { coverage: number; endpointsExplicit: number; validatedPieces: number; expectedPieces: number; offenders: any[] }
  ) => {
    const pct = Math.round(c.coverage * 1000) / 10;
    const bar = renderProgressBar(c.coverage, 28);
    console.log(
      `${chalk.bold(label)}  ${bar}  ${chalk.bold(`${pct}%`)}  ` +
        `${c.endpoints} endpoints | ${c.missingPieces}/${c.totalPieces} missing pieces | ${c.extractedEndpoints} extracted`
    );

    const rvPct = Math.round(rv.coverage * 1000) / 10;
    const rvBar = renderProgressBar(rv.coverage, 28);
    console.log(
      `${" ".repeat(label.length)}  ${chalk.dim("Runtime validate")}  ${rvBar}  ${chalk.bold(`${rvPct}%`)}  ` +
        `${rv.validatedPieces}/${rv.expectedPieces} validated pieces | ${rv.endpointsExplicit} explicit endpoints`
    );

    const offenders = c.files
      .filter((f) => f.missingPieces > 0 || f.extractedEndpoints > 0)
      .sort((a, b) => b.missingPieces - a.missingPieces || b.extractedEndpoints - a.extractedEndpoints)
      .slice(0, 6);
    if (offenders.length) {
      console.log("  Top offen:");
      for (const f of offenders) {
        const parts = [];
        if (f.missingPieces) parts.push(`${f.missingPieces} missing`);
        if (f.extractedEndpoints) parts.push(`${f.extractedEndpoints} extracted`);
        console.log(`  - ${f.file}: ${parts.join(" | ")}`);
      }
    }

    const rvOffenders = (rv.offenders ?? []).slice(0, 6);
    if (rvOffenders.length) {
      console.log("  Top ohne validate():");
      for (const o of rvOffenders) {
        console.log(`  - ${o.method} ${o.path} (${o.operationId}): missing ${o.missing.join(", ")}`);
      }
    }
  };

  console.log("");
  console.log(chalk.bold("📊 Contract Coverage (generated TS)"));
  printOne("Base   ", base, runtime.base);
  printOne("Feature", features, runtime.features);
  console.log("");
}

try {
  console.log("🔧 Generating API contract...");
  ensureOutDir();
  cleanupLegacyFlatRouteFiles();

  // Auto-extract remaining routes (best effort) so the frontend knows ALL endpoints,
  // even before every route is fully annotated with DTOs/contract().
  const extracted = autoExtractExpressRoutes({
    routesRoot: path.join(process.cwd(), "src/routes"),
    mountFiles: [path.join(process.cwd(), "src/routes.ts"), path.join(process.cwd(), "src/individual-routes.ts")],
  });

  const key = (r: RouteSpec) => `${r.method} ${r.path}`;
  const explicitKeys = new Set(apiRegistry.map(key));
  const merged: RouteSpec[] = [
    ...apiRegistry.map((r) => Object.assign(r as any, { __source: "explicit" as const })),
    ...extracted
      .filter((r) => !explicitKeys.has(key(r)))
      .map((r) => Object.assign(r as any, { __source: "extracted" as const })),
  ];

  const openapi = buildOpenApiDoc(merged);
  writeIfChanged(OUT_OPENAPI, JSON.stringify(openapi, null, 2));

  // Split TS output into domain groups to keep files small/maintainable.
  const grouped = new Map<string, RouteSpec[]>();
  for (const r of merged) {
    const k = groupKeyForRoute(r);
    grouped.set(k, [...(grouped.get(k) ?? []), r]);
  }

  // shared types
  writeIfChanged(path.join(OUT_TS_DIR, "types.ts"), buildFrontendTypesFile());

  const basePrefixes = readMountPrefixes(path.join(process.cwd(), "src/routes.ts"));
  const featurePrefixes = readMountPrefixes(path.join(process.cwd(), "src/individual-routes.ts"));
  const baseSegments = new Set(basePrefixes.map((p) => normalizeKeySegment(p.split("/").filter(Boolean)[0] ?? "")));
  const featureSegments = new Set(featurePrefixes.map((p) => normalizeKeySegment(p.split("/").filter(Boolean)[0] ?? "")));

  const groupsIndex: GroupIndex[] = [];
  for (const [k, routes] of Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const file = `routes.${k}`;
    const normalizedKey = normalizeKeySegment(k);

    // Tag-derived key (e.g. "logs") may not match the mount segment ("app_logs").
    // Fall back to the actual path's first segment of any route in the group.
    const pathSegments = new Set(
      routes
        .map((r) => normalizeKeySegment(r.path.split("/").filter(Boolean)[0] ?? ""))
        .filter(Boolean)
    );
    const matchesBase =
      baseSegments.has(normalizedKey) || Array.from(pathSegments).some((s) => baseSegments.has(s));
    const matchesFeature =
      featureSegments.has(normalizedKey) || Array.from(pathSegments).some((s) => featureSegments.has(s));

    const folder: GroupIndex["folder"] = matchesBase
      ? "base"
      : matchesFeature
        ? "features"
        : "features";

    groupsIndex.push({ key: k, file, folder });

    const outDir = folder === "base" ? OUT_TS_BASE_DIR : OUT_TS_FEATURE_DIR;
    // group files live one level deeper => types at "../types" and frontend-types at "../../frontend-types"
    const tsContent = buildFrontendGroupTs(k, routes, {
      typesImportPath: "../types",
      frontendTypesImportPath: "../../frontend-types",
    });
    writeIfChanged(path.join(outDir, `${file}.ts`), tsContent);
  }

  writeIfChanged(OUT_TS_INDEX, buildFrontendIndex(groupsIndex));
  writeIfChanged(path.join(OUT_TS_DIR, "catalog.ts"), buildCatalogTs(basePrefixes, featurePrefixes, groupsIndex));

  // Clean up stale grouped route files after the new ones have been written.
  cleanupStaleGroupedRouteFiles(groupsIndex);

  // Coverage report for quick feedback in CI/dev loops.
  printCoverageReport({ merged, baseSegments, featureSegments });

  console.log("✅ API contract generated successfully!");
  console.log(`📄 OpenAPI: ${OUT_OPENAPI}`);
  console.log(`📄 Frontend TS index: ${OUT_TS_INDEX}`);
} catch (e: any) {
  console.error("❌ Error generating API contract:", e);
  process.exit(1);
}

import fs from "fs";
import path from "path";
import { z } from "zod";
import type { AnyAuthSpec, HttpMethod, RouteSpec } from "./contract.types";

type ExtractOptions = {
  routesRoot: string;
  mountFiles?: string[]; // e.g. src/routes.ts + src/individual-routes.ts
};

const ROUTE_METHODS: Array<{ method: HttpMethod; prop: string }> = [
  { method: "GET", prop: "get" },
  { method: "POST", prop: "post" },
  { method: "PUT", prop: "put" },
  { method: "PATCH", prop: "patch" },
  { method: "DELETE", prop: "delete" },
];

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listRouteFiles(p));
    else if (e.isFile() && e.name.endsWith(".route.ts")) out.push(p);
  }
  return out;
}

function normalizeBasePath(content: string): string | null {
  // Looks for: // CURRENT ROUTE: /x/y or // current route: /x/y
  const m = content.match(/\/\/\s*(?:CURRENT ROUTE|current route)\s*:\s*(\/[^\s]*)/);
  if (!m) return null;
  return m[1].trim().replace(/\/+$/, "");
}

function resolveImport(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) {
    // tsconfig paths: @/ -> src/
    const rel = specifier.slice(2);
    return path.join(process.cwd(), "src", rel) + (rel.endsWith(".ts") ? "" : "");
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return path.join(path.dirname(fromFile), specifier);
  }
  return null;
}

function findMountBasePaths(mountFiles: string[]): Map<string, string> {
  const map = new Map<string, string>(); // resolved route file -> mount base path

  for (const file of mountFiles) {
    const content = fs.readFileSync(file, "utf-8");

    // import X from "path"
    const importRe = /import\s+([A-Za-z0-9_]+)\s+from\s+["']([^"']+)["'];?/g;
    const imports = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content)) !== null) {
      const varName = m[1];
      const spec = m[2];
      const resolved = resolveImport(file, spec);
      if (resolved) imports.set(varName, resolved);
    }

    // app.use("/base", var)
    const useRe = /app\.use\(\s*["'`](\/[^"'`]+)["'`]\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
    while ((m = useRe.exec(content)) !== null) {
      const base = m[1].replace(/\/+$/, "");
      const varName = m[2];
      const importPath = imports.get(varName);
      if (!importPath) continue;

      // normalize to actual .ts file path used in repo
      const candidates = [
        importPath,
        `${importPath}.ts`,
        `${importPath}.tsx`,
        path.join(process.cwd(), importPath),
        path.join(process.cwd(), `${importPath}.ts`),
      ];
      const existing = candidates.find((p) => fs.existsSync(p));
      if (!existing) continue;
      map.set(existing, base);
    }
  }

  return map;
}

function inferAuthFromLine(line: string): AnyAuthSpec | null {
  // Best-effort heuristics
  if (line.includes("AccessControl.onlyAllowHttp")) return { type: "x_api_key_http" };
  if (line.includes("AccessControl.onlyAllowHttps")) return { type: "x_api_key_https" };

  const perm = line.match(/AccessControl\.hasPermission\(\s*AppPermissions\.([A-Za-z0-9_]+)\s*\)/);
  if (perm) return { type: "frontend_permission_http", permission: `AppPermissions.${perm[1]}` };

  if (line.includes("AccessControl.isAuthUser(")) return { type: "frontend_bearer_http" };
  if (line.includes("AccessControl.isFrontendRequest")) return { type: "frontend_bearer_http" };

  if (line.includes("requireAuth(")) {
    // Can't reliably parse options; register as unified bearer
    return { type: "unified_bearer", allowOAuth2: true, allowApiKey: true, allowUserSession: true };
  }

  return null;
}

export function autoExtractExpressRoutes(options: ExtractOptions): RouteSpec[] {
  const files = listRouteFiles(options.routesRoot);
  const routes: RouteSpec[] = [];
  const mountMap = options.mountFiles?.length ? findMountBasePaths(options.mountFiles) : new Map<string, string>();

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const base = normalizeBasePath(content) ?? mountMap.get(file);
    if (!base) continue;

    const lines = content.split("\n");

    // track global auth from `router.use(...)` lines
    let currentAuth: AnyAuthSpec | null = null;

    for (const line of lines) {
      const usePerm = line.match(/router\.use\(\s*AccessControl\.hasPermission\(\s*AppPermissions\.([A-Za-z0-9_]+)\s*\)\s*\)/);
      if (usePerm) {
        currentAuth = { type: "frontend_permission_http", permission: `AppPermissions.${usePerm[1]}` };
        continue;
      }
      const useAuthUser = line.includes("router.use(AccessControl.isAuthUser()");
      if (useAuthUser) {
        currentAuth = { type: "frontend_bearer_http" };
        continue;
      }
    }

    for (const { method, prop } of ROUTE_METHODS) {
      const re = new RegExp(`\\brouter\\.${prop}\\(\\s*([\"'\`])([^\\1]+?)\\1`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const subPath = m[2];
        const fullPath = `${base}${subPath === "/" ? "" : subPath}`.replace(/\/+/g, "/");

        // Find the line containing this match for auth inference
        const before = content.slice(0, m.index);
        const lineStart = before.lastIndexOf("\n") + 1;
        const lineEnd = content.indexOf("\n", m.index);
        const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);

        const auth = inferAuthFromLine(line) ?? currentAuth ?? ({ type: "public" } as const);

        const operationId = `${method}_${fullPath}`.replace(/[^\w]+/g, "_");

        routes.push({
          operationId,
          method,
          path: fullPath,
          tags: [base.split("/")[1] ?? "api"],
          auth,
          responses: [{ kind: "json", status: 200, data: z.any() }],
        });
      }
    }
  }

  return routes;
}


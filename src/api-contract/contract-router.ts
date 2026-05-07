import express, { Router } from "express";
import type { RequestHandler } from "express";
import type { AnyAuthSpec, HttpMethod, RouteSpec } from "./contract.types";
import { registerApiRoutes } from "./registry";
import { getContractMeta, getValidationMeta } from "./contract.middleware";

const AUTH_META = Symbol.for("node-bill.contract.auth");

export type AuthTaggedHandler = RequestHandler & {
  [AUTH_META]?: AnyAuthSpec;
};

export function tagAuth(mw: RequestHandler, auth: AnyAuthSpec): AuthTaggedHandler {
  const fn: any = mw;
  fn[AUTH_META] = auth;
  return fn as AuthTaggedHandler;
}

function extractAuthFromHandlers(handlers: RequestHandler[]): AnyAuthSpec {
  // Most specific wins; default to public.
  for (const h of handlers) {
    const auth = (h as any)?.[AUTH_META] as AnyAuthSpec | undefined;
    if (auth) return auth;
  }
  return { type: "public" };
}

type CreateContractRouterOptions = {
  tags?: string[];
  defaultAuth?: AnyAuthSpec;
};

export function createContractRouter(basePath: string, options: CreateContractRouterOptions = {}) {
  const router: Router = express.Router();

  const register = (method: HttpMethod, path: string, handlers: RequestHandler[]) => {
    const fullPath = `${basePath}${path === "/" ? "" : path}`.replace(/\/+/g, "/");

    const contractMeta = handlers.map(getContractMeta).find(Boolean) ?? {};
    const validationMetas = handlers.map(getValidationMeta).filter(Boolean) as NonNullable<
      ReturnType<typeof getValidationMeta>
    >[];
    const validationMeta = validationMetas.length
      ? validationMetas.reduce((acc, cur) => {
          // merge multiple validate() middlewares (common when params + body are validated separately)
          if (cur.params) acc.params = cur.params;
          if (cur.query) acc.query = cur.query;
          if (cur.body) acc.body = cur.body;
          if (cur.bodyContentType) acc.bodyContentType = cur.bodyContentType;
          return acc;
        }, {} as NonNullable<ReturnType<typeof getValidationMeta>>)
      : undefined;

    const authFromHandlers = extractAuthFromHandlers(handlers);
    const auth = contractMeta.auth ?? options.defaultAuth ?? authFromHandlers ?? { type: "public" };

    const request =
      contractMeta.request || validationMeta
        ? { ...(validationMeta ? { ...validationMeta } : {}), ...(contractMeta.request ? { ...contractMeta.request } : {}) }
        : undefined;

    const responses = contractMeta.responses ?? [
      // fallback: envelope with unknown data
      { kind: "json" as const, status: 200, data: (require("zod") as typeof import("zod")).any() },
    ];

    const spec: RouteSpec = {
      operationId: contractMeta.operationId ?? `${method}_${fullPath}`.replace(/[^\w]+/g, "_"),
      method,
      path: fullPath,
      tags: contractMeta.tags ?? options.tags,
      summary: contractMeta.summary,
      description: contractMeta.description,
      auth,
      request,
      responses,
      "x-validated": validationMeta
        ? { params: !!validationMeta.params, query: !!validationMeta.query, body: !!validationMeta.body }
        : undefined,
    };

    registerApiRoutes(spec);
  };

  const wrap =
    (method: HttpMethod, fn: (path: any, ...handlers: any[]) => any) =>
    (path: string, ...handlers: RequestHandler[]) => {
      register(method, path, handlers);
      return (fn as any).call(router, path, ...handlers);
    };

  return {
    router,
    get: wrap("GET", router.get),
    post: wrap("POST", router.post),
    put: wrap("PUT", router.put),
    patch: wrap("PATCH", (router as any).patch),
    delete: wrap("DELETE", router.delete),
    use: router.use.bind(router),
  };
}


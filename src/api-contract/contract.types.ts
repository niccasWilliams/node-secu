import type { ZodTypeAny } from "zod";
import type { TypeRef } from "./type-ref";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type JsonContentType = "application/json";
export type BodyContentType =
  | "application/json"
  | "multipart/form-data"
  | "application/x-www-form-urlencoded";

export type AuthSpec =
  | { type: "public" }
  | { type: "x_api_key_http" } // AccessControl.onlyAllowHttp (Railway internal HTTP + x-api-key)
  | { type: "x_api_key_https" } // AccessControl.onlyAllowHttps (external HTTPS + x-api-key)
  | { type: "cron_bearer_https" } // AccessControl.isJob (external HTTPS + Authorization Bearer <CRON_JOB_SECRET>)
  | { type: "frontend_bearer_http" } // AccessControl.isAuthUser / hasPermission (internal HTTP + frontend bearer JWT)
  | { type: "frontend_permission_http"; permission: string } // AccessControl.hasPermission(...)
  | {
      type: "unified_bearer"; // requireAuth (Authorization: Bearer <token>)
      allowUserSession?: boolean;
      allowOAuth2?: boolean;
      allowApiKey?: boolean;
      requireRole?: "viewer" | "editor" | "admin";
      scopes?: string[];
    };

/**
 * Compose auth requirements.
 * - `composite_and`: all items must be satisfied (AND)
 * - `composite_or`: any item must be satisfied (OR)
 */
export type CompositeAuthSpec =
  | { type: "composite_and"; items: AuthSpec[] }
  | { type: "composite_or"; items: AuthSpec[] };

export type AnyAuthSpec = AuthSpec | CompositeAuthSpec;

export type JsonResponseSpec = {
  kind: "json";
  status: number;
  /**
   * Data payload schema or type reference.
   * - Zod schema: best for request validation + OpenAPI detail
   * - TypeRef: best for response typing via `frontend-types.ts` without duplicating schemas
   */
  data: ZodTypeAny | TypeRef;
  description?: string;
};

/**
 * JSON response WITHOUT ApiEnvelope wrapper.
 * Use for standards like OAuth2 (RFC 6749 / RFC 7009).
 */
export type JsonRawResponseSpec = {
  kind: "json_raw";
  status: number;
  data: ZodTypeAny | TypeRef;
  description?: string;
};

export type BinaryResponseSpec = {
  kind: "binary";
  status: number;
  contentType: string; // e.g. application/pdf
  description?: string;
};

export type ResponseSpec = JsonResponseSpec | JsonRawResponseSpec | BinaryResponseSpec;

export type RequestSpec = {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
  bodyContentType?: BodyContentType;
};

export type RouteSpec = {
  operationId: string;
  method: HttpMethod;
  path: string;
  tags?: string[];
  summary?: string;
  description?: string;
  auth: AnyAuthSpec;
  request?: RequestSpec;
  responses: ResponseSpec[];
  /**
   * Custom meta: whether this route is protected by runtime Zod validation middleware.
   * This helps track "single source of truth" coverage (typed + validated).
   */
  "x-validated"?: {
    params?: boolean;
    query?: boolean;
    body?: boolean;
  };
};

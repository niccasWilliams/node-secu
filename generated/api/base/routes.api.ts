// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.136Z
// Run `pnpm run api:generate` to regenerate

export type GETApiAmpProxyDiscoverParams = undefined;
export type GETApiAmpProxyDiscoverQuery = import("../types").ContractNotReady<"Query not typed yet. Add DTO + validate({ query }) to the route (or explicitly declare none).">;
export type GETApiAmpProxyDiscoverBody = undefined;
export type GETApiAmpProxyDiscoverResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type GETApiAmpProxyDiscoverResponse = import("../types").ApiEnvelope<GETApiAmpProxyDiscoverResponseData>;

export type GETApiAmpProxyKeyParams = import("../types").ContractNotReady<"Params not typed yet. Add DTO + validate({ params }) to the route.">;
export type GETApiAmpProxyKeyQuery = import("../types").ContractNotReady<"Query not typed yet. Add DTO + validate({ query }) to the route (or explicitly declare none).">;
export type GETApiAmpProxyKeyBody = undefined;
export type GETApiAmpProxyKeyResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type GETApiAmpProxyKeyResponse = import("../types").ApiEnvelope<GETApiAmpProxyKeyResponseData>;

export type POSTApiAmpProxyKeyParams = import("../types").ContractNotReady<"Params not typed yet. Add DTO + validate({ params }) to the route.">;
export type POSTApiAmpProxyKeyQuery = import("../types").ContractNotReady<"Query not typed yet. Add DTO + validate({ query }) to the route (or explicitly declare none).">;
export type POSTApiAmpProxyKeyBody = import("../types").ContractNotReady<"Body not typed yet. Add DTO + validate({ body }) or contract({ request: ... }) to the route.">;
export type POSTApiAmpProxyKeyResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type POSTApiAmpProxyKeyResponse = import("../types").ApiEnvelope<POSTApiAmpProxyKeyResponseData>;

export type DELETEApiAmpProxyKeyParams = import("../types").ContractNotReady<"Params not typed yet. Add DTO + validate({ params }) to the route.">;
export type DELETEApiAmpProxyKeyQuery = import("../types").ContractNotReady<"Query not typed yet. Add DTO + validate({ query }) to the route (or explicitly declare none).">;
export type DELETEApiAmpProxyKeyBody = undefined;
export type DELETEApiAmpProxyKeyResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type DELETEApiAmpProxyKeyResponse = import("../types").ApiEnvelope<DELETEApiAmpProxyKeyResponseData>;

export const apiRoutes_api = {
  "GET__api_amp_proxy__discover": {
    method: "GET",
    path: "/api/amp-proxy/_discover",
    auth: {"type":"public"},
    meta: {
      tags: ["api"],
    },
    types: null as unknown as {
      params: GETApiAmpProxyDiscoverParams;
      query: GETApiAmpProxyDiscoverQuery;
      body: GETApiAmpProxyDiscoverBody;
      response: GETApiAmpProxyDiscoverResponse;
      responseData: GETApiAmpProxyDiscoverResponseData;
    },
  },
  "GET__api_amp_proxy_key": {
    method: "GET",
    path: "/api/amp-proxy/:key",
    auth: {"type":"public"},
    meta: {
      tags: ["api"],
    },
    types: null as unknown as {
      params: GETApiAmpProxyKeyParams;
      query: GETApiAmpProxyKeyQuery;
      body: GETApiAmpProxyKeyBody;
      response: GETApiAmpProxyKeyResponse;
      responseData: GETApiAmpProxyKeyResponseData;
    },
  },
  "POST__api_amp_proxy_key": {
    method: "POST",
    path: "/api/amp-proxy/:key",
    auth: {"type":"public"},
    meta: {
      tags: ["api"],
    },
    types: null as unknown as {
      params: POSTApiAmpProxyKeyParams;
      query: POSTApiAmpProxyKeyQuery;
      body: POSTApiAmpProxyKeyBody;
      response: POSTApiAmpProxyKeyResponse;
      responseData: POSTApiAmpProxyKeyResponseData;
    },
  },
  "DELETE__api_amp_proxy_key": {
    method: "DELETE",
    path: "/api/amp-proxy/:key",
    auth: {"type":"public"},
    meta: {
      tags: ["api"],
    },
    types: null as unknown as {
      params: DELETEApiAmpProxyKeyParams;
      query: DELETEApiAmpProxyKeyQuery;
      body: DELETEApiAmpProxyKeyBody;
      response: DELETEApiAmpProxyKeyResponse;
      responseData: DELETEApiAmpProxyKeyResponseData;
    },
  },
} as const;
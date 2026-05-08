// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.139Z
// Run `pnpm run api:generate` to regenerate

import type { OAuth2AuditLog, PaginatedResult, UnsensitiveOAuth2Client } from "../../frontend-types";

export type Oauth2TokenParams = undefined;
export type Oauth2TokenQuery = undefined;
export type Oauth2TokenBody = {
  grant_type: "client_credentials" | "refresh_token";
  client_id: string;
  client_secret: string;
  scope?: string;
  refresh_token?: string;
};
export type Oauth2TokenResponseData = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};
export type Oauth2TokenResponse = Oauth2TokenResponseData;

export type Oauth2RevokeParams = undefined;
export type Oauth2RevokeQuery = undefined;
export type Oauth2RevokeBody = {
  token: string;
  client_id: string;
  client_secret: string;
  token_type_hint?: "refresh_token" | "access_token";
};
export type Oauth2RevokeResponseData = {
  status: "ok";
};
export type Oauth2RevokeResponse = Oauth2RevokeResponseData;

export type Oauth2ClientsCreateParams = undefined;
export type Oauth2ClientsCreateQuery = undefined;
export type Oauth2ClientsCreateBody = {
  name: string;
  description?: string;
  role: "viewer" | "editor" | "admin";
  scopes?: Array<string>;
  defaultCostCenter?: number;
  availableCostCenters?: Array<number>;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  allowedIps?: Array<string>;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  validTo?: string;
};
export type Oauth2ClientsCreateResponseData = { client: UnsensitiveOAuth2Client; credentials: { client_id: string; client_secret: string; warning: string } };
export type Oauth2ClientsCreateResponse = import("../types").ApiEnvelope<Oauth2ClientsCreateResponseData>;

export type Oauth2ClientsListParams = undefined;
export type Oauth2ClientsListQuery = {
  page?: number;
  pageSize?: number;
};
export type Oauth2ClientsListBody = undefined;
export type Oauth2ClientsListResponseData = PaginatedResult<UnsensitiveOAuth2Client>;
export type Oauth2ClientsListResponse = import("../types").ApiEnvelope<Oauth2ClientsListResponseData>;

export type Oauth2ClientsRevokeParams = {
  id: number;
};
export type Oauth2ClientsRevokeQuery = undefined;
export type Oauth2ClientsRevokeBody = undefined;
export type Oauth2ClientsRevokeResponseData = null;
export type Oauth2ClientsRevokeResponse = import("../types").ApiEnvelope<Oauth2ClientsRevokeResponseData>;

export type Oauth2ClientsAuditParams = {
  id: number;
};
export type Oauth2ClientsAuditQuery = {
  page?: number;
  pageSize?: number;
};
export type Oauth2ClientsAuditBody = undefined;
export type Oauth2ClientsAuditResponseData = PaginatedResult<OAuth2AuditLog>;
export type Oauth2ClientsAuditResponse = import("../types").ApiEnvelope<Oauth2ClientsAuditResponseData>;

export type Oauth2ClientsUpdateParams = {
  id: number;
};
export type Oauth2ClientsUpdateQuery = undefined;
export type Oauth2ClientsUpdateBody = {
  name?: string;
  description?: string;
  role?: "viewer" | "editor" | "admin";
  scopes?: Array<string>;
  defaultCostCenter?: number;
  availableCostCenters?: Array<number>;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  allowedIps?: Array<string>;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  validTo?: string;
};
export type Oauth2ClientsUpdateResponseData = UnsensitiveOAuth2Client;
export type Oauth2ClientsUpdateResponse = import("../types").ApiEnvelope<Oauth2ClientsUpdateResponseData>;

export type Oauth2ScopesListParams = undefined;
export type Oauth2ScopesListQuery = {

};
export type Oauth2ScopesListBody = undefined;
export type Oauth2ScopesListResponseData = Record<string, Array<string>>;
export type Oauth2ScopesListResponse = import("../types").ApiEnvelope<Oauth2ScopesListResponseData>;

export const apiRoutes_oauth2 = {
  "oauth2_token": {
    method: "POST",
    path: "/oauth/token",
    auth: {"type":"public"},
    meta: {
      tags: ["oauth2"],
      bodyContentType: "application/x-www-form-urlencoded",
    },
    types: null as unknown as {
      params: Oauth2TokenParams;
      query: Oauth2TokenQuery;
      body: Oauth2TokenBody;
      response: Oauth2TokenResponse;
      responseData: Oauth2TokenResponseData;
    },
  },
  "oauth2_revoke": {
    method: "POST",
    path: "/oauth/revoke",
    auth: {"type":"public"},
    meta: {
      tags: ["oauth2"],
      bodyContentType: "application/x-www-form-urlencoded",
    },
    types: null as unknown as {
      params: Oauth2RevokeParams;
      query: Oauth2RevokeQuery;
      body: Oauth2RevokeBody;
      response: Oauth2RevokeResponse;
      responseData: Oauth2RevokeResponseData;
    },
  },
  "oauth2_clients_create": {
    method: "POST",
    path: "/oauth/clients/create",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["oauth2"],
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: Oauth2ClientsCreateParams;
      query: Oauth2ClientsCreateQuery;
      body: Oauth2ClientsCreateBody;
      response: Oauth2ClientsCreateResponse;
      responseData: Oauth2ClientsCreateResponseData;
    },
  },
  "oauth2_clients_list": {
    method: "GET",
    path: "/oauth/clients/list",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["oauth2"],
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: Oauth2ClientsListParams;
      query: Oauth2ClientsListQuery;
      body: Oauth2ClientsListBody;
      response: Oauth2ClientsListResponse;
      responseData: Oauth2ClientsListResponseData;
    },
  },
  "oauth2_clients_revoke": {
    method: "DELETE",
    path: "/oauth/clients/revoke/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["oauth2"],
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: Oauth2ClientsRevokeParams;
      query: Oauth2ClientsRevokeQuery;
      body: Oauth2ClientsRevokeBody;
      response: Oauth2ClientsRevokeResponse;
      responseData: Oauth2ClientsRevokeResponseData;
    },
  },
  "oauth2_clients_audit": {
    method: "GET",
    path: "/oauth/clients/audit/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["oauth2"],
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: Oauth2ClientsAuditParams;
      query: Oauth2ClientsAuditQuery;
      body: Oauth2ClientsAuditBody;
      response: Oauth2ClientsAuditResponse;
      responseData: Oauth2ClientsAuditResponseData;
    },
  },
  "oauth2_clients_update": {
    method: "PUT",
    path: "/oauth/clients/update/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["oauth2"],
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: Oauth2ClientsUpdateParams;
      query: Oauth2ClientsUpdateQuery;
      body: Oauth2ClientsUpdateBody;
      response: Oauth2ClientsUpdateResponse;
      responseData: Oauth2ClientsUpdateResponseData;
    },
  },
  "oauth2_scopes_list": {
    method: "GET",
    path: "/oauth/scopes",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["oauth2"],
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: Oauth2ScopesListParams;
      query: Oauth2ScopesListQuery;
      body: Oauth2ScopesListBody;
      response: Oauth2ScopesListResponse;
      responseData: Oauth2ScopesListResponseData;
    },
  },
} as const;
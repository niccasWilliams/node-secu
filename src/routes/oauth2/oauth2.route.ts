/**
 * OAuth2 Routes
 *
 * Public endpoints for OAuth2 token grant/revocation
 * Protected endpoints for OAuth2 client management
 */

import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import { oauth2Controller } from "./oauth2.controller";
import { z } from "zod";
import {
  oauth2ClientAuditQuerySchema,
  oauth2ClientCreateBodySchema,
  oauth2ClientIdParamSchema,
  oauth2ClientUpdateBodySchema,
  oauth2ClientsListQuerySchema,
  oauth2EmptyQuerySchema,
  oauth2ErrorResponseSchema,
  oauth2RevokeBodySchema,
  oauth2RevokeResponseSchema,
  oauth2TokenBodySchema,
  oauth2TokenResponseSchema,
} from "./oauth2.dto";

const c = createContractRouter("/oauth", { tags: ["oauth2"] });
const router = c.router;

// ============================================================================
// PUBLIC ENDPOINTS (No authentication required)
// ============================================================================

/**
 * POST /oauth/token
 *
 * OAuth 2.0 Token Endpoint (RFC 6749 Section 3.2)
 *
 * Grant Types:
 * - client_credentials: Get access token with client credentials
 * - refresh_token: Refresh an expired access token
 */
c.post(
  "/token",
  // NOTE: OAuth2 responses are NOT ApiEnvelope-wrapped (RFC 6749).
  contract({
    operationId: "oauth2_token",
    auth: { type: "public" },
    request: {
      body: oauth2TokenBodySchema,
      bodyContentType: "application/x-www-form-urlencoded",
    },
    responses: [
      { kind: "json_raw", status: 200, data: oauth2TokenResponseSchema },
      { kind: "json_raw", status: 400, data: oauth2ErrorResponseSchema },
      { kind: "json_raw", status: 401, data: oauth2ErrorResponseSchema },
      { kind: "json_raw", status: 500, data: oauth2ErrorResponseSchema },
    ],
  }),
  oauth2Controller.token.bind(oauth2Controller)
);

/**
 * POST /oauth/revoke
 *
 * Token Revocation Endpoint (RFC 7009)
 */
c.post(
  "/revoke",
  contract({
    operationId: "oauth2_revoke",
    auth: { type: "public" },
    request: {
      body: oauth2RevokeBodySchema,
      bodyContentType: "application/x-www-form-urlencoded",
    },
    responses: [
      { kind: "json_raw", status: 200, data: oauth2RevokeResponseSchema },
      { kind: "json_raw", status: 400, data: oauth2ErrorResponseSchema },
      { kind: "json_raw", status: 401, data: oauth2ErrorResponseSchema },
      { kind: "json_raw", status: 500, data: oauth2ErrorResponseSchema },
    ],
  }),
  oauth2Controller.revoke.bind(oauth2Controller)
);


// ============================================================================
// PROTECTED ENDPOINTS (User authentication required)
// ============================================================================

/**
 * POST /oauth/clients/create
 *
 * Create a new OAuth2 client (Admin only)
 */
c.post(
  "/clients/create",
  AccessControl.isAuthUser(),
  validate({ body: oauth2ClientCreateBodySchema }),
  contract({
    operationId: "oauth2_clients_create",
    auth: { type: "frontend_bearer_http" },
    responses: [
      {
        kind: "json",
        status: 201,
        data: typeRefExpr(
          "{ client: UnsensitiveOAuth2Client; credentials: { client_id: string; client_secret: string; warning: string } }",
          ["UnsensitiveOAuth2Client"]
        ),
      },
    ],
  }),
  oauth2Controller.createClient
);

/**
 * GET /oauth/clients/list?page=1&pageSize=10
 *
 * List OAuth2 clients (Admin only)
 */
c.get(
  "/clients/list",
  AccessControl.isAuthUser(),
  validate({ query: oauth2ClientsListQuerySchema }),
  contract({
    operationId: "oauth2_clients_list",
    auth: { type: "frontend_bearer_http" },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr("PaginatedResult<UnsensitiveOAuth2Client>", ["PaginatedResult", "UnsensitiveOAuth2Client"]),
      },
    ],
  }),
  oauth2Controller.listClients
);

/**
 * DELETE /oauth/clients/revoke/:id
 *
 * Revoke an OAuth2 client and all its tokens (Admin only)
 */
c.delete(
  "/clients/revoke/:id",
  AccessControl.isAuthUser(),
  validate({ params: oauth2ClientIdParamSchema }),
  contract({
    operationId: "oauth2_clients_revoke",
    auth: { type: "frontend_bearer_http" },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  oauth2Controller.revokeClient
);

/**
 * GET /oauth/clients/audit/:id
 *
 * Get audit logs for an OAuth2 client (Admin only)
 */
c.get(
  "/clients/audit/:id",
  AccessControl.isAuthUser(),
  validate({ params: oauth2ClientIdParamSchema, query: oauth2ClientAuditQuerySchema }),
  contract({
    operationId: "oauth2_clients_audit",
    auth: { type: "frontend_bearer_http" },
    responses: [
      { kind: "json", status: 200, data: typeRefExpr("PaginatedResult<OAuth2AuditLog>", ["PaginatedResult", "OAuth2AuditLog"]) },
    ],
  }),
  oauth2Controller.getClientAuditLogs
);

/**
 * PUT /oauth/clients/update/:id
 *
 * Update OAuth2 client settings (Admin only)
 */
c.put(
  "/clients/update/:id",
  AccessControl.isAuthUser(),
  validate({ params: oauth2ClientIdParamSchema, body: oauth2ClientUpdateBodySchema }),
  contract({
    operationId: "oauth2_clients_update",
    auth: { type: "frontend_bearer_http" },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("UnsensitiveOAuth2Client", ["UnsensitiveOAuth2Client"]) }],
  }),
  oauth2Controller.updateClientSettings
);

c.get(
  "/scopes",
  AccessControl.isAuthUser(),
  validate({ query: oauth2EmptyQuerySchema }),
  contract({
    operationId: "oauth2_scopes_list",
    auth: { type: "frontend_bearer_http" },
    responses: [
      {
        kind: "json",
        status: 200,
        data: z.record(z.string(), z.array(z.string())),
      },
    ],
  }),
  oauth2Controller.getAvailableScopes
)

export default router;

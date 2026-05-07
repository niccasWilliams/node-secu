/**
 * Entitlement API Routes (Incoming - External Apps -> NodeBill)
 *
 * Base path in this backend: /entitlements
 * (Shop can point its entitlementPath to this base path.)
 *
 * IMPORTANT:
 * This route does NOT use NodeBill's internal OAuth2/API-Key auth.
 * It supports two receiver-only auth modes:
 * 1) API Key: Bearer token equals ENTITLEMENTS_SYNC_API_KEY
 * 2) OAuth2: Bearer token is validated locally (token issued by this app's /oauth/token)
 *
 * Optional OAuth sender check:
 * - ENTITLEMENTS_SYNC_OAUTH_ALLOWED_CLIENT_IDS limits allowed OAuth2 client_id values (JWT "sub")
 */

import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { OAuth2Scope } from "@/routes/oauth2/oauth2-scopes";
import { oauth2TokenService } from "@/routes/oauth2/oauth2-token.service";
import { APP_ID } from "@/app.config";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRef, typeRefExpr } from "@/api-contract/type-ref";
import {
    assignEntitlementBodySchema,
    entitlementEmptyQuerySchema,
    entitlementIdParamSchema,
    assignedEntitlementsQuerySchema,
    userIdParamSchema,
    entitlementStateParamsSchema,
    entitlementUpdateBodySchema,
    entitlementShopAssignmentParamSchema,
    usageOveragesPullQuerySchema,
    creditUpdateWebhookBodySchema,
} from "./entitlement.dto";
import { entitlementController } from "./entitlement.controller";
import { appManifestController } from "./app-manifest.controller";
import { logService } from "@/routes/log-service/log-service.service";

const c = createContractRouter("/entitlements", { tags: ["entitlements"] });
const router = c.router;

function getTrimmedEnv(name: string): string {
    return (process.env[name] ?? "").trim();
}

function parseCsv(raw: string): string[] {
    return raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
}

function safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;
    const token = parts[1]?.trim();
    return token ? token : null;
}

function getHeaderValue(req: Request, name: string): string | null {
    const raw = req.headers[name.toLowerCase()];
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    if (Array.isArray(raw) && raw.length > 0) {
        const first = String(raw[0] ?? "").trim();
        return first.length > 0 ? first : null;
    }
    return null;
}

function hasAllScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every((required) => grantedScopes.includes(required));
}

function normalizeAppId(value: string): string {
    return value.trim().toLowerCase();
}

type EntitlementAuthOptions = {
    requiredScopes?: OAuth2Scope[];
};

function requireEntitlementSyncAuth(options: EntitlementAuthOptions = {}) {
    const { requiredScopes = [] } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        const bearerToken = getBearerToken(req);
        if (!bearerToken) {
            return res.status(401).json({
                error: "unauthorized",
                message: "Missing or invalid Authorization header",
            });
        }

        const apiKeySecret = getTrimmedEnv("ENTITLEMENTS_SYNC_API_KEY");
        const hasApiKeyMode = Boolean(apiKeySecret);

        const allowedOAuthClients = parseCsv(getTrimmedEnv("ENTITLEMENTS_SYNC_OAUTH_ALLOWED_CLIENT_IDS"));

        const targetAppId = getHeaderValue(req, "x-target-app-id");
        if (targetAppId && normalizeAppId(targetAppId) !== normalizeAppId(APP_ID)) {

            await logService.error(`Received entitlement sync request with invalid x-target-app-id '${targetAppId}' (expected '${APP_ID}')`, {
                requestPath: req.path,
                requestMethod: req.method,
                receivedTargetAppId: targetAppId,
            });
            return res.status(400).json({
                error: "invalid_target_app",
                message: `x-target-app-id '${targetAppId}' does not match app '${APP_ID}'`,
            });
        }

        if (hasApiKeyMode && safeEquals(bearerToken, apiKeySecret)) {
            (req as any).entitlementSyncAuth = { mode: "api_key", oauthClientId: null };
            return next();
        }

        try {
            const payload = await oauth2TokenService.verifyAccessToken(bearerToken);
            if (!payload) {
                console.warn("Failed to verify bearer token for entitlement sync");
                return res.status(401).json({
                    error: "invalid_token",
                    message: "OAuth access token is invalid or inactive",
                });
            }

            if (allowedOAuthClients.length > 0 && !allowedOAuthClients.includes(payload.sub)) {
                return res.status(403).json({
                    error: "forbidden",
                    message: "OAuth client is not allowed for entitlement sync",
                });
            }

            const grantedScopes = payload.scopes;
            if (requiredScopes.length > 0 && !hasAllScopes(grantedScopes, requiredScopes)) {
                return res.status(403).json({
                    error: "insufficient_scope",
                    message: "Missing required entitlement scopes",
                    requiredScopes,
                });
            }

            (req as any).entitlementSyncAuth = { mode: "oauth", oauthClientId: payload.sub };
            return next();
        } catch (error) {
            console.error("Entitlement OAuth validation failed:", error);
            return res.status(401).json({
                error: "invalid_token",
                message: "OAuth access token is invalid or inactive",
            });
        }
    };
}

// ----------------------------------------------------------------------------
// Core endpoints expected by shop integration
// ----------------------------------------------------------------------------

c.get(
    "/",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ query: entitlementEmptyQuerySchema }),
    contract({
        operationId: "entitlements_list",
        summary: "List available entitlements",
        description:
            "Returns available entitlements for sync. Payload follows the external entitlements contract.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [
            {
                kind: "json",
                status: 200,
                data: typeRefExpr(
                    "{ app: { appId: string }; data: Array<{ externalIdentifier: string; entitlementType: 'role' | 'area'; externalName: string; externalDescription: string | null }>; total: number }",
                    []
                ),
            },
        ],
    }),
    entitlementController.getEntitlements.bind(entitlementController)
);

c.post(
    "/",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_WRITE] }),
    validate({ body: assignEntitlementBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "entitlements_assign",
        summary: "Assign entitlement to user",
        description:
            "Assigns an entitlement to a user. Idempotent behavior: existing assignment is updated and returns 200.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_WRITE],
        },
        responses: [
            {
                kind: "json",
                status: 201,
                data: typeRefExpr(
                    "{ created: boolean; externalUserId: string; externalIdentifier: string; entitlementType: 'role' | 'area'; validFrom: Date; expiresAt: Date | null }",
                    []
                ),
            },
            {
                kind: "json",
                status: 200,
                data: typeRefExpr(
                    "{ created: boolean; externalUserId: string; externalIdentifier: string; entitlementType: 'role' | 'area'; validFrom: Date; expiresAt: Date | null }",
                    []
                ),
            },
        ],
    }),
    entitlementController.assignEntitlement.bind(entitlementController)
);

c.get(
    "/:userId/:type/:identifier",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ params: entitlementStateParamsSchema }),
    contract({
        operationId: "entitlements_get_state",
        summary: "Get current entitlement state",
        description:
            "Returns the current entitlement assignment for one user + identifier tuple.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [
            {
                kind: "json",
                status: 200,
                data: typeRefExpr(
                    "{ externalUserId: string; externalIdentifier: string; entitlementType: 'role' | 'area'; validFrom: Date; expiresAt: Date | null }",
                    []
                ),
            },
            { kind: "json", status: 404, data: typeRefExpr("{ message: string }", []) },
        ],
    }),
    entitlementController.getEntitlementState.bind(entitlementController)
);

c.put(
    "/:userId/:type/:identifier",
    requireEntitlementSyncAuth({
        requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ, OAuth2Scope.ENTITLEMENTS_WRITE],
    }),
    validate({ params: entitlementStateParamsSchema, body: entitlementUpdateBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "entitlements_update_state",
        summary: "Update entitlement validity",
        description:
            "Updates (or creates) a single entitlement assignment for one user + identifier tuple.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ, OAuth2Scope.ENTITLEMENTS_WRITE],
        },
        responses: [
            {
                kind: "json",
                status: 200,
                data: typeRefExpr(
                    "{ success: boolean; externalUserId: string; externalIdentifier: string; entitlementType: 'role' | 'area'; validFrom: Date; expiresAt: Date | null }",
                    []
                ),
            },
        ],
    }),
    entitlementController.updateEntitlement.bind(entitlementController)
);

c.delete(
    "/:userId/:type/:identifier",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_WRITE] }),
    validate({ params: entitlementStateParamsSchema }),
    contract({
        operationId: "entitlements_revoke",
        summary: "Revoke entitlement from user",
        description:
            "Revokes the entitlement assignment. Idempotent: missing assignment still returns success.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_WRITE],
        },
        responses: [
            { kind: "json", status: 200, data: typeRefExpr("{ success: boolean; revoked: boolean }", []) },
        ],
    }),
    entitlementController.revokeEntitlement.bind(entitlementController)
);

// ----------------------------------------------------------------------------
// Legacy compatibility endpoints
// ----------------------------------------------------------------------------

c.get(
    "/getAll",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ query: entitlementEmptyQuerySchema }),
    contract({
        operationId: "entitlements_getAll",
        summary: "Alias for listing entitlements",
        description: "Alias endpoint for backwards compatibility.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [
            {
                kind: "json",
                status: 200,
                data: typeRefExpr(
                    "{ app: { appId: string }; data: Array<{ externalIdentifier: string; entitlementType: 'role' | 'area'; externalName: string; externalDescription: string | null }>; total: number }",
                    []
                ),
            },
        ],
    }),
    entitlementController.getEntitlements.bind(entitlementController)
);

c.get(
    "/assigned",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ query: assignedEntitlementsQuerySchema }),
    contract({
        operationId: "entitlements_getAssigned",
        summary: "Get role assignments (legacy)",
        description: "Legacy endpoint for active role assignments.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [{ kind: "json", status: 200, data: typeRefExpr("{ data: RoleAssignment[]; total: number }", ["RoleAssignment"]) }],
    }),
    entitlementController.getAssignedEntitlements.bind(entitlementController)
);

c.get(
    "/user/:userId",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ params: userIdParamSchema }),
    contract({
        operationId: "entitlements_getUserEntitlements",
        summary: "Get active user entitlements (legacy)",
        description: "Legacy endpoint returning active user roles with permissions.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [{ kind: "json", status: 200, data: typeRefExpr("{ data: Role[]; total: number }", ["Role"]) }],
    }),
    entitlementController.getUserEntitlements.bind(entitlementController)
);

c.get(
    "/context/by-shop-assignment/:shopAssignmentId",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ params: entitlementShopAssignmentParamSchema }),
    contract({
        operationId: "entitlements_context_get_by_shop_assignment",
        summary: "Get entitlement sync context by shop assignment id",
        description:
            "Returns the persisted entitlement-sync context row (shop linkage + local assignment references) for a given x-shop-assignment-id.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [
            { kind: "json", status: 200, data: typeRefExpr("{ id: number } & Record<string, unknown>", []) },
            { kind: "json", status: 404, data: typeRefExpr("{ message: string }", []) },
        ],
    }),
    entitlementController.getSyncContextByShopAssignment.bind(entitlementController)
);

c.get(
    "/usage-overages",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ query: usageOveragesPullQuerySchema }),
    contract({
        operationId: "entitlements_usage_overages_pull",
        summary: "Pull usage overages",
        description:
            "Returns deterministic usage-overage events for shop-initiated pull billing sync. Endpoint is idempotent via stable externalEventId per event snapshot.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [
            { kind: "json", status: 200, data: typeRefExpr("Array<Record<string, unknown>>", []) },
        ],
    }),
    entitlementController.getUsageOverages.bind(entitlementController)
);

c.get(
    "/:id",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    validate({ params: entitlementIdParamSchema }),
    contract({
        operationId: "entitlements_getById",
        summary: "Get entitlement by role id (legacy)",
        description: "Legacy endpoint: returns sellable role details by numeric role id.",
        auth: {
            type: "unified_bearer",
            allowUserSession: false,
            scopes: [OAuth2Scope.ENTITLEMENTS_READ],
        },
        responses: [
            { kind: "json", status: 200, data: typeRef("Role") },
            { kind: "json", status: 404, data: typeRefExpr("{ message: string }", []) },
        ],
    }),
    entitlementController.getEntitlementById.bind(entitlementController)
);

// --- App Manifest: Describes what this app offers ---
router.get(
    "/app-manifest",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    appManifestController.getManifest.bind(appManifestController)
);

// --- Webhooks from Shop ---
// Reuse same entitlement sync auth as other endpoints

router.post(
    "/webhooks/usage-alerts",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    entitlementController.handleUsageAlertWebhook.bind(entitlementController)
);

router.post(
    "/webhooks/credit-update",
    requireEntitlementSyncAuth({ requiredScopes: [OAuth2Scope.ENTITLEMENTS_READ] }),
    entitlementController.handleCreditUpdateWebhook.bind(entitlementController)
);

export default router;

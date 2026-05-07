/**
 * OAuth2 Authentication Middleware
 *
 * Validates JWT access tokens from OAuth2 Client Credentials flow.
 * Use this for protecting API endpoints that should be accessible via OAuth2.
 *
 * Tenant-aware: When OAUTH2_TENANT_CONFIG.enabled = true, extracts tenant
 * context (e.g. managingCompanyId, costCenters) from JWT into req.oauth2.
 *
 * Standard: RFC 6750 (Bearer Token Usage)
 * https://datatracker.ietf.org/doc/html/rfc6750
 */

import { Request, Response, NextFunction } from "express";
import { oauth2TokenService, AccessTokenPayload } from "@/routes/oauth2/oauth2-token.service";
import { OAUTH2_TENANT_CONFIG } from "@/routes/oauth2/individual/oauth2-tenant.config";

/**
 * Extended Express Request with OAuth2 authentication context.
 *
 * Base fields (always present): role, scopes, clientId, jti
 * Tenant fields (present when OAUTH2_TENANT_CONFIG.enabled):
 *   e.g. managingCompanyId, costCenters, defaultCostCenter
 */
export interface OAuth2AuthenticatedRequest extends Request {
    oauth2?: {
        role: "viewer" | "editor" | "admin";
        scopes: string[];
        clientId: string;
        jti: string;
        /** Tenant fields — dynamically populated from JWT when tenant config is enabled */
        [key: string]: unknown;
    };
}

/**
 * Middleware: Require OAuth2 access token
 */
export async function requireOAuth2(
    req: OAuth2AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                error: "unauthorized",
                error_description: "Missing Authorization header",
            });
        }

        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                error: "invalid_request",
                error_description: "Invalid Authorization header format. Expected: Bearer <access_token>",
            });
        }

        const accessToken = parts[1];
        const payload = await oauth2TokenService.verifyAccessToken(accessToken);

        if (!payload) {
            return res.status(401).json({
                error: "invalid_token",
                error_description: "Invalid or expired access token",
            });
        }

        // Attach OAuth2 context to request
        req.oauth2 = {
            role: payload.role,
            scopes: payload.scopes,
            clientId: payload.sub,
            jti: payload.jti,
        };

        // Attach tenant fields from JWT when tenant isolation is enabled
        if (OAUTH2_TENANT_CONFIG.enabled) {
            req.oauth2[OAUTH2_TENANT_CONFIG.tenantField] = (payload as any)[OAUTH2_TENANT_CONFIG.tenantField];

            for (const rf of OAUTH2_TENANT_CONFIG.resourceFields ?? []) {
                req.oauth2[rf.field] = (payload as any)[rf.field] ?? null;
            }
        }

        next();
    } catch (error) {
        console.error("OAuth2 authentication error:", error);
        return res.status(500).json({
            error: "server_error",
            error_description: "Failed to authenticate access token",
        });
    }
}

/**
 * Middleware: Require specific OAuth2 scopes (AND logic)
 */
export function requireScopes(...requiredScopes: string[]) {
    return (req: OAuth2AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.oauth2) {
            return res.status(401).json({
                error: "unauthorized",
                error_description: "OAuth2 authentication required",
            });
        }

        const missingScopes = requiredScopes.filter(
            (scope) => !req.oauth2!.scopes.includes(scope)
        );

        if (missingScopes.length > 0) {
            return res.status(403).json({
                error: "insufficient_scope",
                error_description: `Missing required scopes: ${missingScopes.join(", ")}`,
                scope: requiredScopes.join(" "),
            });
        }

        next();
    };
}

/**
 * Middleware: Require specific role (hierarchy: admin > editor > viewer)
 */
export function requireOAuth2Role(...allowedRoles: ("viewer" | "editor" | "admin")[]) {
    return (req: OAuth2AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.oauth2) {
            return res.status(401).json({
                error: "unauthorized",
                error_description: "OAuth2 authentication required",
            });
        }

        const userRole = req.oauth2.role;
        if (userRole === "admin") return next();
        if (userRole === "editor" && (allowedRoles.includes("editor") || allowedRoles.includes("viewer"))) return next();
        if (userRole === "viewer" && allowedRoles.includes("viewer")) return next();

        return res.status(403).json({
            error: "insufficient_role",
            error_description: `Insufficient role. Required: ${allowedRoles.join(" or ")}`,
        });
    };
}

/**
 * Check resource-field access (e.g. cost center).
 * Only meaningful when OAUTH2_TENANT_CONFIG has resourceFields.
 *
 * Returns true if:
 * - resourceId is null (no restriction)
 * - role is admin (unrestricted)
 * - resourceId is in the allowed list from the JWT
 */
export function hasOAuth2ResourceAccess(
    req: OAuth2AuthenticatedRequest,
    resourceField: string,
    resourceId: number | null
): boolean {
    if (!req.oauth2) return false;
    if (resourceId === null) return true;
    if (req.oauth2.role === "admin") return true;

    const allowed = req.oauth2[resourceField] as number[] | null | undefined;
    if (!Array.isArray(allowed)) return false;
    return allowed.includes(resourceId);
}

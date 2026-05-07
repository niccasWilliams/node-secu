/**
 * Unified Authentication Middleware
 *
 * Supports multiple authentication methods:
 * 1. OAuth2 Access Token (JWT)
 * 2. API Key (Bearer Token) — only when OAUTH2_TENANT_CONFIG.enabled (requires managing-companies module)
 * 3. User Session (Cookie-based)
 *
 * Tenant-aware: When OAUTH2_TENANT_CONFIG.enabled = true, includes tenant context
 * (managingCompanyId, costCenters, etc.) in the auth context. API Key auth is only
 * available when tenant modules exist (dynamic import).
 */

import { Request, Response, NextFunction } from "express";
import { getUserIdFromRequest } from "@/util/utils";
import { getManagingCompanyIdFromRequest } from "@/util/individual/tenant-utils";
import { oauth2TokenService } from "@/routes/oauth2/oauth2-token.service";
import { OAuth2Scope, hasScope } from "@/routes/oauth2/oauth2-scopes";
import { UserId } from "@/db/schema";
import { OAUTH2_TENANT_CONFIG } from "@/routes/oauth2/individual/oauth2-tenant.config";

type EnabledTenantCfg = { enabled: true; tenantField: string; resourceFields?: { field: string; type: string }[] };
function tenantCfg(): EnabledTenantCfg | null {
    return OAUTH2_TENANT_CONFIG.enabled ? (OAUTH2_TENANT_CONFIG as any) : null;
}

/**
 * Unified Auth Context — attached to req.auth
 */
export interface UnifiedAuthContext {
    authType: "user" | "oauth2" | "apikey";

    // Tenant field — populated from JWT/API Key/Session when tenant enabled, 0 when disabled
    managingCompanyId: number;

    // User Session Auth
    userId?: UserId;

    // OAuth2 Auth
    oauth2?: {
        clientId: string;
        role: "viewer" | "editor" | "admin";
        scopes: string[];
        costCenters: number[] | null;
        defaultCostCenter: number | null;
        jti: string;
    };

    // API Key Auth (only when tenant enabled and managing-companies module exists)
    apiKey?: {
        apiKeyId: number;
        name: string;
        role: "viewer" | "editor" | "admin";
        costCenters: number[] | null;
        defaultCostCenter: number | null;
    };

    hasRole(requiredRole: "viewer" | "editor" | "admin"): boolean | Promise<boolean>;
    hasCostCenterAccess(costCenterId: number | null): boolean | Promise<boolean>;
}

export interface AuthenticatedRequest extends Request {
    auth: UnifiedAuthContext;
}

interface RequireAuthOptions {
    allowUserSession?: boolean;
    allowOAuth2?: boolean;
    allowApiKey?: boolean;
    requireRole?: "viewer" | "editor" | "admin";
}

/**
 * Main Authentication Middleware
 *
 * Priority: OAuth2 JWT → API Key (tenant only) → User Session
 */
export function requireAuth(options: RequireAuthOptions = {}) {
    const {
        allowUserSession = true,
        allowOAuth2 = false,
        allowApiKey = false,
        requireRole,
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers.authorization;
            const tc = tenantCfg();

            // ================================================================
            // 1. Try OAuth2 JWT Token
            // ================================================================
            if (allowOAuth2 && authHeader?.startsWith("Bearer ")) {
                const token = authHeader.substring(7);

                if (token.startsWith("eyJ")) {
                    const payload = await oauth2TokenService.verifyAccessToken(token);

                    if (payload) {
                        const managingCompanyId = tc ? ((payload as any)[tc.tenantField] ?? 0) : 0;
                        const costCenters = tc ? ((payload as any).costCenters ?? null) : null;
                        const defaultCostCenter = tc ? ((payload as any).defaultCostCenter ?? null) : null;

                        const authReq = req as AuthenticatedRequest;
                        authReq.auth = {
                            authType: "oauth2",
                            managingCompanyId,
                            oauth2: {
                                clientId: payload.sub,
                                role: payload.role,
                                scopes: payload.scopes,
                                costCenters,
                                defaultCostCenter,
                                jti: payload.jti,
                            },
                            hasRole: (role) => hasRolePermission(payload.role, role),
                            hasCostCenterAccess: (costCenterId: number | null) => {
                                if (costCenterId === null) return true;
                                if (payload.role === "admin") return true;
                                if (costCenters === null) return true;
                                if (!Array.isArray(costCenters)) return false;
                                return costCenters.includes(costCenterId);
                            },
                        };

                        if (requireRole && !authReq.auth.hasRole(requireRole)) {
                            return res.status(403).json({ error: "forbidden", error_description: `Insufficient role. Required: ${requireRole}` });
                        }
                        return next();
                    }
                }
            }

            // ================================================================
            // 2. Try API Key (only when tenant is enabled — requires managing-companies module)
            // ================================================================
            if (allowApiKey && tc && authHeader?.startsWith("Bearer ")) {
                const token = authHeader.substring(7);

                if (token.startsWith("nbill_live_") || token.startsWith("nbill_test_")) {
                    try {
                        const apiKeyModPath = "@/routes/managing-companies/company-api-keys/company-api-key.useCase";
                        const { companyApiKeyUseCase } = await import(/* webpackIgnore: true */ apiKeyModPath);

                        const apiKeyAuth = await companyApiKeyUseCase.authenticateCompanyAPIRequest(token);
                        if (apiKeyAuth && apiKeyAuth.managingCompanyId != null) {
                            const costCenters = apiKeyAuth.apiKey.availableCostCenters
                                ? JSON.parse(apiKeyAuth.apiKey.availableCostCenters as string)
                                : null;

                            const authReq = req as AuthenticatedRequest;
                            authReq.auth = {
                                authType: "apikey",
                                managingCompanyId: apiKeyAuth.managingCompanyId,
                                apiKey: {
                                    apiKeyId: apiKeyAuth.apiKey.id,
                                    name: apiKeyAuth.apiKey.name,
                                    role: apiKeyAuth.role as "viewer" | "editor" | "admin",
                                    costCenters,
                                    defaultCostCenter: (apiKeyAuth.apiKey.defaultCostCenter ?? null) as number | null,
                                },
                                hasRole: (role) => hasRolePermission(apiKeyAuth.role, role),
                                hasCostCenterAccess: (costCenterId: number | null) => {
                                    if (costCenterId === null) return true;
                                    if (apiKeyAuth.role === "admin") return true;
                                    if (!costCenters) return true;
                                    return costCenters.includes(costCenterId);
                                },
                            };

                            if (requireRole && !authReq.auth.hasRole(requireRole)) {
                                return res.status(403).json({ error: "forbidden", message: `Insufficient role. Required: ${requireRole}` });
                            }
                            return next();
                        }
                    } catch {
                        // managing-companies module not available — skip API key auth
                    }
                }
            }

            // ================================================================
            // 3. Try User Session (Cookie-based)
            // ================================================================
            if (allowUserSession) {
                const userId = await getUserIdFromRequest(req);
                if (!userId) {
                    return sendNoAuth(res, allowUserSession, allowOAuth2, allowApiKey);
                }

                // Tenant mode: get managing company from session
                let managingCompanyId = 0;
                if (tc) {
                    managingCompanyId = (await getManagingCompanyIdFromRequest(req)) ?? 0;
                    if (!managingCompanyId) {
                        return sendNoAuth(res, allowUserSession, allowOAuth2, allowApiKey);
                    }
                }

                // Check role if required
                if (requireRole) {
                    const hasAccess = await checkUserRole(userId, requireRole, managingCompanyId || undefined);
                    if (!hasAccess) {
                        return res.status(403).json({ error: "forbidden", message: `Insufficient role. Required: ${requireRole}` });
                    }
                }

                const authReq = req as AuthenticatedRequest;
                const finalMcId = managingCompanyId;
                authReq.auth = {
                    authType: "user",
                    managingCompanyId,
                    userId,
                    hasRole: async (role) => checkUserRole(userId, role, finalMcId || undefined),
                    hasCostCenterAccess: async (costCenterId: number | null) => {
                        if (costCenterId === null) return true;
                        if (!tc || !finalMcId) return true;
                        try {
                            const mcPath = "@/routes/managing-companies/managing-company.useCase";
                            const { managingCompanyUseCase } = await import(/* webpackIgnore: true */ mcPath);
                            const userCostCenters = await managingCompanyUseCase.getUserCostCenters(finalMcId, userId);
                            if (userCostCenters === null) return true;
                            return userCostCenters.includes(costCenterId);
                        } catch {
                            return true;
                        }
                    },
                };

                return next();
            }

            return sendNoAuth(res, allowUserSession, allowOAuth2, allowApiKey);
        } catch (error: any) {
            console.error("Error in requireAuth middleware:", error);
            return res.status(500).json({ error: "server_error", message: error.message || "Internal server error" });
        }
    };
}

/**
 * Scope Validation Middleware (OAuth2 only — skipped for User/API Key)
 */
export function requireScopes(...requiredScopes: OAuth2Scope[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const authReq = req as AuthenticatedRequest;
        if (!authReq.auth) {
            return res.status(401).json({ error: "unauthorized", message: "Authentication required" });
        }

        if (authReq.auth.authType === "oauth2") {
            const grantedScopes = authReq.auth.oauth2!.scopes;
            const missingScopes = requiredScopes.filter((scope) => !hasScope(grantedScopes, scope));
            if (missingScopes.length > 0) {
                return res.status(403).json({
                    error: "insufficient_scope",
                    message: `Missing required scopes: ${missingScopes.join(", ")}`,
                    required_scopes: requiredScopes,
                });
            }
        }

        next();
    };
}

function hasRolePermission(userRole: string, requiredRole: "viewer" | "editor" | "admin"): boolean {
    if (userRole === "admin") return true;
    if (userRole === "editor") return requiredRole === "viewer" || requiredRole === "editor";
    if (userRole === "viewer") return requiredRole === "viewer";
    return false;
}

async function checkUserRole(userId: UserId, requiredRole: string, managingCompanyId?: number): Promise<boolean> {
    if (OAUTH2_TENANT_CONFIG.enabled && managingCompanyId) {
        try {
            const mcPath = "@/routes/managing-companies/managing-company.useCase";
            const { managingCompanyUseCase } = await import(/* webpackIgnore: true */ mcPath);
            return await managingCompanyUseCase.hasCompanyAccess(managingCompanyId, userId, requiredRole);
        } catch {
            // fallback
        }
    }

    try {
        const { permissionUseCase } = await import("@/routes/auth/roles/permissions/permission.useCase");
        const { AppPermissions } = await import("@/routes/auth/roles/permissions/permission.service");
        return await permissionUseCase.hasUserPermission(userId, AppPermissions.UsersManage);
    } catch {
        return false;
    }
}

function sendNoAuth(res: Response, allowUser: boolean, allowOAuth2: boolean, allowApiKey: boolean) {
    const methods = [];
    if (allowUser) methods.push("User Session");
    if (allowOAuth2) methods.push("OAuth2");
    if (allowApiKey) methods.push("API Key");
    return res.status(401).json({
        error: "unauthorized",
        message: `Authentication required. Allowed methods: ${methods.join(", ")}`,
    });
}

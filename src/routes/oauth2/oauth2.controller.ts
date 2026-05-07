/**
 * OAuth2 Controller
 *
 * Implements RFC 6749 OAuth 2.0 Token Endpoint
 *
 * Endpoints:
 * - POST /oauth/token - Token grant/refresh
 * - POST /oauth/revoke - Token revocation
 * - GET /oauth/clients - List OAuth2 clients (admin only)
 * - POST /oauth/clients - Create OAuth2 client (admin only)
 */

import { Request, Response } from "express";
import { oauth2UseCase, OAuth2Error } from "./oauth2.useCase";
import { oauth2ClientService } from "./oauth2-client.service";
import { responseHandler } from "@/lib/communication";
import { getUserIdFromRequest } from "@/util/utils";
import { getManagingCompanyIdFromRequest } from "@/util/individual/tenant-utils";
import { validatedBody, validatedParams, validatedQuery } from "@/api-contract/validated";
import { logService } from "@/routes/log-service/log-service.service";
import { OAUTH2_TENANT_CONFIG } from "./individual/oauth2-tenant.config";
import {
    oauth2ClientAuditQuerySchema,
    oauth2ClientCreateBodySchema,
    oauth2ClientIdParamSchema,
    oauth2ClientUpdateBodySchema,
    oauth2ClientsListQuerySchema,
    oauth2RevokeBodySchema,
    oauth2TokenBodySchema,
} from "./oauth2.dto";

class OAuth2Controller {
    constructor() {
        this.token = this.token.bind(this);
        this.revoke = this.revoke.bind(this);
        this.createClient = this.createClient.bind(this);
        this.listClients = this.listClients.bind(this);
        this.revokeClient = this.revokeClient.bind(this);
        this.getClientAuditLogs = this.getClientAuditLogs.bind(this);
        this.updateClientSettings = this.updateClientSettings.bind(this);
        this.getAvailableScopes = this.getAvailableScopes.bind(this);
    }

    private setNoStoreHeaders(res: Response): void {
        res.set("Cache-Control", "no-store");
        res.set("Pragma", "no-cache");
    }

    private sendOAuthError(
        res: Response,
        params: { status: number; error: string; error_description?: string }
    ) {
        this.setNoStoreHeaders(res);

        if (params.status === 401 && params.error === "invalid_client") {
            res.set("WWW-Authenticate", `Basic realm="oauth2", error="invalid_client"`);
        }

        return res.status(params.status).json({
            error: params.error,
            error_description: params.error_description,
        });
    }

    /**
     * POST /oauth/token
     *
     * OAuth 2.0 Token Endpoint (RFC 6749 Section 3.2)
     */
    async token(req: Request, res: Response) {
        try {
            this.setNoStoreHeaders(res);
            const body = (req.body ?? {}) as Record<string, unknown>;
            const rawGrantType = typeof body.grant_type === "string" ? body.grant_type : "";
            if (!rawGrantType) {
                return this.sendOAuthError(res, {
                    status: 400,
                    error: "invalid_request",
                    error_description: "Missing grant_type parameter",
                });
            }

            if (rawGrantType !== "client_credentials" && rawGrantType !== "refresh_token") {
                return this.sendOAuthError(res, {
                    status: 400,
                    error: "unsupported_grant_type",
                    error_description: `Grant type '${rawGrantType}' is not supported. Supported types: client_credentials, refresh_token`,
                });
            }

            const parsed = oauth2TokenBodySchema.safeParse(body);
            if (!parsed.success) {
                return this.sendOAuthError(res, {
                    status: 400,
                    error: "invalid_request",
                    error_description: parsed.error.issues?.[0]?.message ?? parsed.error.message,
                });
            }
            const { grant_type, client_id, client_secret, scope, refresh_token } = parsed.data;

            // Metadata for audit logging
            const metadata = {
                ipAddress: req.ip || req.socket.remoteAddress,
                userAgent: req.headers["user-agent"],
            };

            // Validate required fields
            if (!grant_type) {
                return this.sendOAuthError(res, {
                    status: 400,
                    error: "invalid_request",
                    error_description: "Missing grant_type parameter",
                });
            }

            if (!client_id || !client_secret) {
                return this.sendOAuthError(res, {
                    status: 400,
                    error: "invalid_request",
                    error_description: "Missing client_id or client_secret",
                });
            }

            // Handle grant type
            switch (grant_type) {
                case "client_credentials": {
                    const tokenPair = await oauth2UseCase.grantClientCredentials({
                        client_id,
                        client_secret,
                        scope,
                        metadata,
                    });

                    return res.json(tokenPair);
                }

                case "refresh_token": {
                    if (!refresh_token) {
                        return this.sendOAuthError(res, {
                            status: 400,
                            error: "invalid_request",
                            error_description: "Missing refresh_token parameter",
                        });
                    }

                    const tokenPair = await oauth2UseCase.refreshAccessToken({
                        client_id,
                        client_secret,
                        refresh_token,
                        metadata,
                    });

                    return res.json(tokenPair);
                }

                default:
                    return this.sendOAuthError(res, {
                        status: 400,
                        error: "unsupported_grant_type",
                        error_description: `Grant type '${grant_type}' is not supported. Supported types: client_credentials, refresh_token`,
                    });
            }
        } catch (error: any) {
            await logService.error("OAuth2 token error:", { error });

            // Handle OAuth2 errors (RFC 6749 Section 5.2)
            if (error instanceof OAuth2Error) {
                return this.sendOAuthError(res, {
                    status: error.error === "invalid_client" ? 401 : 400,
                    error: error.error,
                    error_description: error.error_description,
                });
            }

            // Generic server error
            return this.sendOAuthError(res, {
                status: 500,
                error: "server_error",
                error_description: error.message || "Internal server error",
            });
        }
    }

    /**
     * POST /oauth/revoke
     *
     * Token Revocation Endpoint (RFC 7009)
     */
    async revoke(req: Request, res: Response) {
        try {
            this.setNoStoreHeaders(res);
            const parsed = oauth2RevokeBodySchema.safeParse(req.body ?? {});
            if (!parsed.success) {
                return this.sendOAuthError(res, {
                    status: 400,
                    error: "invalid_request",
                    error_description: parsed.error.issues?.[0]?.message ?? parsed.error.message,
                });
            }
            const { token, client_id, client_secret, token_type_hint } = parsed.data;

            await oauth2UseCase.revokeToken({
                client_id,
                client_secret,
                token,
                token_type_hint,
            });

            // RFC 7009: Return 200 regardless of whether token existed
            return res.status(200).json({ status: "ok" });
        } catch (error: any) {
            await logService.error("OAuth2 revoke error:", { error });

            if (error instanceof OAuth2Error) {
                return this.sendOAuthError(res, {
                    status: error.error === "invalid_client" ? 401 : 400,
                    error: error.error,
                    error_description: error.error_description,
                });
            }

            return this.sendOAuthError(res, {
                status: 500,
                error: "server_error",
                error_description: error.message || "Internal server error",
            });
        }
    }

    /**
     * POST /oauth/clients
     *
     * Create a new OAuth2 client (admin only)
     */
    async createClient(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 401, "Unauthorized");

            // Get tenant context (managing company) when tenant mode is enabled
            let managingCompanyId: number | undefined;
            if (OAUTH2_TENANT_CONFIG.enabled) {
                managingCompanyId = await getManagingCompanyIdFromRequest(req) ?? undefined;
                if (!managingCompanyId) {
                    return responseHandler(res, 400, "No managing company selected");
                }
            }

            const body = validatedBody(req, oauth2ClientCreateBodySchema);
            if (!body) return responseHandler(res, 400, "Invalid body");
            const {
                name,
                description,
                role,
                scopes,
                accessTokenTtl,
                refreshTokenTtl,
                allowedIps,
                rateLimitPerMinute,
                rateLimitPerHour,
                validTo,
            } = body;

            if (!name || !role) {
                return responseHandler(res, 400, "Missing required fields: name, role");
            }

            const result = await oauth2UseCase.createOAuth2Client({
                managingCompanyId,
                name,
                description,
                role,
                scopes,
                defaultCostCenter: (body as any).defaultCostCenter,
                availableCostCenters: (body as any).availableCostCenters,
                accessTokenTtl,
                refreshTokenTtl,
                allowedIps,
                rateLimitPerMinute,
                rateLimitPerHour,
                validTo: validTo ? new Date(validTo) : undefined,
                createdBy: userId,
            });

            return responseHandler(res, 201, "OAuth2 client created successfully", {
                client: result.client,
                credentials: {
                    client_id: result.clientId,
                    client_secret: result.clientSecret,
                    warning: "Save these credentials now! The client_secret will never be shown again.",
                },
            });
        } catch (error: any) {
            await logService.error("Error creating OAuth2 client:", { error });
            return responseHandler(res, 500, error.message || "Failed to create OAuth2 client");
        }
    }

    /**
     * GET /oauth/clients
     *
     * List OAuth2 clients (admin only)
     */
    async listClients(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 401, "Unauthorized");

            // Get tenant context when enabled
            let managingCompanyId: number | undefined;
            if (OAUTH2_TENANT_CONFIG.enabled) {
                managingCompanyId = await getManagingCompanyIdFromRequest(req) ?? undefined;
                if (!managingCompanyId) {
                    return responseHandler(res, 400, "No managing company selected");
                }

                // Verify admin access
                try {
                    const p = "@/routes/managing-companies/managing-company.useCase";
                    const mod = await import(/* webpackIgnore: true */ p);
                    await mod.managingCompanyUseCase.assertCompanyAccess(managingCompanyId, userId, "admin");
                } catch (error: any) {
                    if (error?.code !== "MODULE_NOT_FOUND") throw error;
                }
            }

            const q = validatedQuery(req, oauth2ClientsListQuerySchema) ?? {};
            const page = (q as any).page ?? 1;
            const pageSize = (q as any).pageSize ?? 10;

            const result = await oauth2ClientService.getOAuth2ClientsByCompany(
                page,
                pageSize,
                undefined,
                managingCompanyId
            );

            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            await logService.error("Error listing OAuth2 clients:", { error });
            return responseHandler(res, 500, error.message || "Failed to list OAuth2 clients");
        }
    }

    /**
     * DELETE /oauth/clients/revoke/:id
     *
     * Revoke an OAuth2 client and all its tokens (admin only)
     */
    async revokeClient(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 401, "Unauthorized");

            const params = validatedParams(req, oauth2ClientIdParamSchema);
            if (!params) return responseHandler(res, 400, "Invalid client ID");

            await oauth2UseCase.revokeOAuth2Client(params.id, userId);

            return responseHandler(res, 200, "OAuth2 client revoked successfully");
        } catch (error: any) {
            await logService.error("Error revoking OAuth2 client:", { error });
            return responseHandler(res, 500, error.message || "Failed to revoke OAuth2 client");
        }
    }

    /**
     * GET /oauth/clients/audit/:id
     *
     * Get audit logs for an OAuth2 client (admin only)
     */
    async getClientAuditLogs(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 401, "Unauthorized");

            const params = validatedParams(req, oauth2ClientIdParamSchema);
            if (!params) return responseHandler(res, 400, "Invalid client ID");
            const q = validatedQuery(req, oauth2ClientAuditQuerySchema) ?? {};
            const page = (q as any).page ?? 1;
            const pageSize = (q as any).pageSize ?? 50;

            // Get client to check access
            const client = await oauth2ClientService.getOAuth2ClientById(params.id);
            if (!client) {
                return responseHandler(res, 404, "OAuth2 client not found");
            }

            const result = await oauth2ClientService.getClientAuditLogs(params.id as any, page, pageSize);

            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            await logService.error("Error fetching audit logs:", { error });
            return responseHandler(res, 500, error.message || "Failed to fetch audit logs");
        }
    }

    async updateClientSettings(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 401, "Unauthorized");

            const params = validatedParams(req, oauth2ClientIdParamSchema);
            if (!params) return responseHandler(res, 400, "Invalid client ID");
            const updateData = validatedBody(req, oauth2ClientUpdateBodySchema);
            if (!updateData) return responseHandler(res, 400, "Invalid body");

            const updatedClient = await oauth2UseCase.updateOAuth2ClientSettings(params.id, updateData as any, userId);

            return responseHandler(res, 200, "OAuth2 client updated successfully", updatedClient);
        } catch (error: any) {
            await logService.error("Error updating OAuth2 client:", { error });
            return responseHandler(res, 500, error.message || "Failed to update OAuth2 client");
        }
    }

    async getAvailableScopes(_req: Request, res: Response) {
        try {
            const result = oauth2UseCase.getAvailableScopes();
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            await logService.error("Error getting available scopes:", { error });
            return responseHandler(res, 500, error.message || "Failed to get available scopes");
        }
    }
}

export const oauth2Controller = new OAuth2Controller();

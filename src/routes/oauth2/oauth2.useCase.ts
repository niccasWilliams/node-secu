/**
 * OAuth2 Use Case
 *
 * Business logic for OAuth2 Client Credentials flow:
 * 1. Token grant (client_credentials)
 * 2. Token refresh (refresh_token)
 * 3. Token revocation
 * 4. Client management
 *
 * Standard: RFC 6749 (OAuth 2.0 Authorization Framework)
 */

import { oauth2ClientService } from "./oauth2-client.service";
import { oauth2TokenService, TokenPair } from "./oauth2-token.service";
import { OAuth2Client, OAuth2ClientId, UnsensitiveOAuth2Client } from "./oauth2-client.schema";
import { UserId } from "@/db/schema";
import { OAuth2Scope, validateScopes, OAuth2ScopeValue, SCOPE_GROUPS } from "./oauth2-scopes";
import { OAUTH2_TENANT_CONFIG } from "./individual/oauth2-tenant.config";

type EnabledTenantConfig = { enabled: true; tenantField: string; resourceFields?: { field: string; type: string }[] };

/** Narrows tenant config to enabled variant (TS can't narrow imported module-level vars) */
function tenantConfig(): EnabledTenantConfig | null {
    return OAUTH2_TENANT_CONFIG.enabled ? OAUTH2_TENANT_CONFIG as any : null;
}

/**
 * Token request error (RFC 6749 Section 5.2)
 */
export class OAuth2Error extends Error {
    constructor(
        public error:
            | "invalid_request"
            | "invalid_client"
            | "invalid_grant"
            | "unauthorized_client"
            | "unsupported_grant_type"
            | "invalid_scope",
        public error_description?: string
    ) {
        super(error_description || error);
        this.name = "OAuth2Error";
    }
}

class OAuth2UseCase {
    private readonly entitlementScopes = new Set<string>([
        OAuth2Scope.ENTITLEMENTS_READ,
        OAuth2Scope.ENTITLEMENTS_WRITE,
    ]);

    private readonly autoGrantedEntitlementsScopes: OAuth2ScopeValue[] = [
        OAuth2Scope.ENTITLEMENTS_READ,
        OAuth2Scope.ENTITLEMENTS_WRITE,
    ];

    private parseCsv(raw: string): string[] {
        return raw
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
    }

    private isEntitlementsScope(scope: string): boolean {
        return this.entitlementScopes.has(scope);
    }

    private getEntitlementsAllowlistedClientIds(): Set<string> {
        const raw = process.env.ENTITLEMENTS_SYNC_OAUTH_ALLOWED_CLIENT_IDS ?? "";
        return new Set(this.parseCsv(raw));
    }

    private assertNoEntitlementsScopesInClientConfig(scopes?: string[]): void {
        if (!scopes || scopes.length === 0) return;
        const entitlementsScopes = scopes.filter((scope) => this.isEntitlementsScope(scope));
        if (entitlementsScopes.length > 0) {
            throw new Error(
                `Scopes ${entitlementsScopes.join(", ")} are reserved for entitlement sync and cannot be set manually on OAuth clients`
            );
        }
    }

    // --- Cost Center Policy (active when tenant config has cost center resourceFields) ---

    private hasCostCenterFields(tc: EnabledTenantConfig): boolean {
        return tc.resourceFields?.some(f =>
            f.field === "defaultCostCenter" || f.field === "availableCostCenters"
        ) ?? false;
    }

    private normalizeCostCenterList(input?: number[] | null): number[] {
        if (!input) return [];
        return Array.from(
            new Set(
                input
                    .map((v) => Number(v))
                    .filter((v) => Number.isInteger(v) && v > 0)
            )
        );
    }

    private parseStoredCostCenters(raw: unknown): number[] {
        if (!raw) return [];
        if (Array.isArray(raw)) return this.normalizeCostCenterList(raw as number[]);
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? this.normalizeCostCenterList(parsed) : [];
            } catch {
                return [];
            }
        }
        return [];
    }

    private async validateCostCenterIdsBelongToCompany(
        tenantId: number,
        ids: number[]
    ): Promise<void> {
        if (ids.length === 0) return;
        try {
            const p = "@/routes/managing-companies/cost-centers/cost-center.service";
            const mod = await import(/* webpackIgnore: true */ p);
            const service = mod.companyCostCenterService;
            for (const id of ids) {
                const cc = await service.getCompanyCostCenterById(id);
                if (!cc || cc.managingCompanyId !== tenantId) {
                    throw new Error(`Cost center ${id} does not belong to tenant ${tenantId}`);
                }
                if ((cc as any).isArchived) {
                    throw new Error(`Cost center ${id} is archived and cannot be used`);
                }
            }
        } catch (error: any) {
            if (error?.code === "MODULE_NOT_FOUND") return;
            throw error;
        }
    }

    private async resolveCostCenterPolicy(params: {
        tenantId: number;
        role: "viewer" | "editor" | "admin";
        defaultCostCenter?: number | null;
        availableCostCenters?: number[] | null;
    }): Promise<{ defaultCostCenter: number | null; availableCostCenters: number[] | null }> {
        const defaultCostCenter = params.defaultCostCenter ?? null;
        const available = this.normalizeCostCenterList(params.availableCostCenters ?? []);

        if (defaultCostCenter !== null) {
            await this.validateCostCenterIdsBelongToCompany(params.tenantId, [defaultCostCenter]);
        }
        await this.validateCostCenterIdsBelongToCompany(params.tenantId, available);

        if (params.role === "admin") {
            return { defaultCostCenter, availableCostCenters: null };
        }

        if (defaultCostCenter !== null && !available.includes(defaultCostCenter)) {
            throw new Error("defaultCostCenter must be included in availableCostCenters for non-admin OAuth2 clients");
        }

        return { defaultCostCenter, availableCostCenters: available };
    }

    /**
     * Validate scopes against client's allowed scopes
     * IMPORTANT: Only validates against PRE-DEFINED scopes from oauth2-scopes.ts
     */
    private validateClientScopes(requestedScopes: string[], client: OAuth2Client): OAuth2ScopeValue[] {
        // 1. Validate all requested scopes are valid (predefined)
        try {
            validateScopes(requestedScopes);
        } catch (error: any) {
            throw new OAuth2Error("invalid_scope", error.message);
        }

        const allowlistedEntitlementsClientIds = this.getEntitlementsAllowlistedClientIds();
        const isEntitlementsAllowlistedClient = allowlistedEntitlementsClientIds.has(client.clientId);
        const autoGrantedEntitlementsScopes = isEntitlementsAllowlistedClient
            ? this.autoGrantedEntitlementsScopes
            : [];

        const requestedEntitlementsScopes = requestedScopes.filter((scope) => this.isEntitlementsScope(scope));
        if (requestedEntitlementsScopes.length > 0 && !isEntitlementsAllowlistedClient) {
            throw new OAuth2Error(
                "invalid_scope",
                "entitlements:* scopes are reserved and require ENTITLEMENTS_SYNC_OAUTH_ALLOWED_CLIENT_IDS allowlisting"
            );
        }

        const requestedRegularScopes = requestedScopes.filter((scope) => !this.isEntitlementsScope(scope));

        // 2. If client has scope restrictions, check them
        if (!client.scopes) {
            const grantedScopes = [
                ...requestedRegularScopes,
                ...autoGrantedEntitlementsScopes,
            ];
            return Array.from(new Set(grantedScopes)) as OAuth2ScopeValue[];
        }

        try {
            const allowedScopes = JSON.parse(client.scopes as string) as string[];

            // Filter requested scopes to only include allowed ones
            const grantedRegularScopes = requestedRegularScopes.filter((scope) =>
                allowedScopes.includes(scope)
            );

            const grantedScopes = [
                ...grantedRegularScopes,
                ...autoGrantedEntitlementsScopes,
            ];

            if (grantedScopes.length === 0) {
                throw new OAuth2Error(
                    "invalid_scope",
                    `None of the requested scopes are allowed for this client. Allowed: ${allowedScopes.join(", ")}`
                );
            }

            return Array.from(new Set(grantedScopes)) as OAuth2ScopeValue[];
        } catch (error) {
            if (error instanceof OAuth2Error) throw error;

            console.error("Error parsing client scopes:", error);
            throw new OAuth2Error("server_error" as any, "Failed to validate scopes");
        }
    }

    /**
     * Parse scope string to array
     * Format: "invoices:read invoices:write expenses:read"
     */
    private parseScopes(scopeString?: string): string[] {
        if (!scopeString) return [];
        return scopeString
            .split(/\s+/)
            .filter(Boolean)
            .map((s) => s.trim());
    }

    /**
     * Grant tokens using Client Credentials flow (RFC 6749 Section 4.4)
     */
    async grantClientCredentials(params: {
        client_id: string;
        client_secret: string;
        scope?: string;
        metadata?: {
            ipAddress?: string;
            userAgent?: string;
        };
    }): Promise<TokenPair> {
        try {
            // 1. Authenticate client
            const client = await oauth2ClientService.authenticateClient(
                params.client_id,
                params.client_secret
            );

            if (!client) {
                // Log failed attempt
                await oauth2ClientService.logOAuth2Request({
                    clientId: null,
                    grantType: "client_credentials",
                    scope: params.scope ?? null,
                    success: false,
                    errorCode: "invalid_client",
                    errorDescription: "Invalid client credentials",
                    ipAddress: params.metadata?.ipAddress ?? null,
                    userAgent: params.metadata?.userAgent ?? null,
                });

                throw new OAuth2Error(
                    "invalid_client",
                    "Invalid client_id or client_secret"
                );
            }

            // 2. Parse and validate scopes
            const requestedScopes = this.parseScopes(params.scope);
            const grantedScopes = this.validateClientScopes(requestedScopes, client);

            // 3. Create token pair
            const tokenPair = await oauth2TokenService.createTokenPair(
                client,
                grantedScopes,
                params.metadata
            );

            // 4. Log successful grant
            await oauth2ClientService.logOAuth2Request({
                clientId: client.id,
                grantType: "client_credentials",
                scope: grantedScopes.join(" "),
                success: true,
                errorCode: null,
                errorDescription: null,
                ipAddress: params.metadata?.ipAddress ?? null,
                userAgent: params.metadata?.userAgent ?? null,
            });

            return tokenPair;
        } catch (error) {
            if (error instanceof OAuth2Error) throw error;

            console.error("Error in grantClientCredentials:", error);
            throw new OAuth2Error("server_error" as any, "Failed to grant tokens");
        }
    }

    /**
     * Refresh an access token using a refresh token (RFC 6749 Section 6)
     */
    async refreshAccessToken(params: {
        client_id: string;
        client_secret: string;
        refresh_token: string;
        metadata?: {
            ipAddress?: string;
            userAgent?: string;
        };
    }): Promise<TokenPair> {
        try {
            // 1. Authenticate client
            const client = await oauth2ClientService.authenticateClient(
                params.client_id,
                params.client_secret
            );

            if (!client) {
                await oauth2ClientService.logOAuth2Request({
                    clientId: null,
                    grantType: "refresh_token",
                    scope: null,
                    success: false,
                    errorCode: "invalid_client",
                    errorDescription: "Invalid client credentials",
                    ipAddress: params.metadata?.ipAddress ?? null,
                    userAgent: params.metadata?.userAgent ?? null,
                });

                throw new OAuth2Error("invalid_client", "Invalid client_id or client_secret");
            }

            // 2. Validate refresh token
            const storedToken = await oauth2TokenService.validateRefreshToken(
                params.refresh_token
            );

            if (!storedToken || storedToken.clientId !== client.id) {
                await oauth2ClientService.logOAuth2Request({
                    clientId: client.id,
                    grantType: "refresh_token",
                    scope: null,
                    success: false,
                    errorCode: "invalid_grant",
                    errorDescription: "Invalid or expired refresh token",
                    ipAddress: params.metadata?.ipAddress ?? null,
                    userAgent: params.metadata?.userAgent ?? null,
                });

                throw new OAuth2Error("invalid_grant", "Invalid or expired refresh token");
            }

            // 3. Parse scopes from stored token
            const scopes = this.parseScopes(storedToken.scope ?? undefined);

            // 4. Revoke old refresh token (token rotation for security)
            await oauth2TokenService.revokeRefreshToken(
                storedToken.id,
                "Token rotated (refresh_token grant)"
            );

            // 5. Create new token pair
            const tokenPair = await oauth2TokenService.createTokenPair(
                client,
                scopes,
                params.metadata
            );

            // 6. Log successful refresh
            await oauth2ClientService.logOAuth2Request({
                clientId: client.id,
                grantType: "refresh_token",
                scope: scopes.join(" "),
                success: true,
                errorCode: null,
                errorDescription: null,
                ipAddress: params.metadata?.ipAddress ?? null,
                userAgent: params.metadata?.userAgent ?? null,
            });

            return tokenPair;
        } catch (error) {
            if (error instanceof OAuth2Error) throw error;

            console.error("Error in refreshAccessToken:", error);
            throw new OAuth2Error("server_error" as any, "Failed to refresh token");
        }
    }

    /**
     * Revoke a token (RFC 7009)
     */
    async revokeToken(params: {
        client_id: string;
        client_secret: string;
        token: string;
        token_type_hint?: "refresh_token" | "access_token";
    }): Promise<void> {
        try {
            // 1. Authenticate client
            const client = await oauth2ClientService.authenticateClient(
                params.client_id,
                params.client_secret
            );

            if (!client) {
                throw new OAuth2Error("invalid_client", "Invalid client credentials");
            }

            // 2. Attempt to revoke refresh token
            const storedToken = await oauth2TokenService.validateRefreshToken(params.token);

            if (storedToken && storedToken.clientId === client.id) {
                await oauth2TokenService.revokeRefreshToken(storedToken.id, "Revoked by client");
            }

            // Note: Access tokens are stateless JWTs and cannot be revoked
            // They will expire naturally based on their exp claim
        } catch (error) {
            if (error instanceof OAuth2Error) throw error;

            console.error("Error in revokeToken:", error);
            throw new OAuth2Error("server_error" as any, "Failed to revoke token");
        }
    }

    /**
     * Create a new OAuth2 client (admin only)
     */
    async createOAuth2Client(params: {
        managingCompanyId?: number;
        name: string;
        description?: string;
        role: "viewer" | "editor" | "admin";
        scopes?: string[];
        defaultCostCenter?: number;
        availableCostCenters?: number[];
        accessTokenTtl?: number;
        refreshTokenTtl?: number;
        allowedIps?: string[];
        rateLimitPerMinute?: number;
        rateLimitPerHour?: number;
        validTo?: Date;
        createdBy: UserId;
    }): Promise<{ client: UnsensitiveOAuth2Client; clientId: string; clientSecret: string }> {

        // Tenant access check (when tenant is enabled)
        const tc = tenantConfig();
        if (tc && params.managingCompanyId) {
            try {
                const p = "@/routes/managing-companies/managing-company.useCase";
                const mod = await import(/* webpackIgnore: true */ p);
                await mod.managingCompanyUseCase.assertCompanyAccess(
                    params.managingCompanyId,
                    params.createdBy,
                    "admin"
                );
            } catch (error: any) {
                if (error?.code !== "MODULE_NOT_FOUND") throw error;
            }
        }

        // Validate scopes (if provided)
        if (params.scopes && params.scopes.length > 0) {
            try {
                validateScopes(params.scopes);
                this.assertNoEntitlementsScopesInClientConfig(params.scopes);
            } catch (error: any) {
                throw new Error(`Invalid scopes: ${error.message}`);
            }
        }

        // Build insert data
        const insertData: any = {
            name: params.name,
            description: params.description ?? null,
            role: params.role,
            scopes: params.scopes ? JSON.stringify(params.scopes) : null,
            accessTokenTtl: params.accessTokenTtl ?? 3600,
            refreshTokenTtl: params.refreshTokenTtl ?? 2592000,
            allowedIps: params.allowedIps ? JSON.stringify(params.allowedIps) : null,
            allowedOrigins: null,
            rateLimitPerMinute: params.rateLimitPerMinute ?? 60,
            rateLimitPerHour: params.rateLimitPerHour ?? 1000,
            validTo: params.validTo ?? null,
            createdBy: params.createdBy,
        };

        // Add tenant fields when enabled
        if (tc && params.managingCompanyId) {
            insertData[tc.tenantField] = params.managingCompanyId;

            // Cost center policy validation (when resourceFields include cost centers)
            if (this.hasCostCenterFields(tc)) {
                const policy = await this.resolveCostCenterPolicy({
                    tenantId: params.managingCompanyId,
                    role: params.role,
                    defaultCostCenter: params.defaultCostCenter ?? null,
                    availableCostCenters: params.availableCostCenters ?? [],
                });
                insertData.defaultCostCenter = policy.defaultCostCenter;
                insertData.availableCostCenters = policy.availableCostCenters
                    ? JSON.stringify(policy.availableCostCenters)
                    : null;
            } else {
                if (params.defaultCostCenter !== undefined) {
                    insertData.defaultCostCenter = params.defaultCostCenter;
                }
                if (params.availableCostCenters !== undefined) {
                    insertData.availableCostCenters = JSON.stringify(params.availableCostCenters);
                }
            }
        }

        return await oauth2ClientService.createOAuth2Client(insertData);
    }

    /**
     * Revoke an OAuth2 client and all its tokens (admin only)
     */
    async revokeOAuth2Client(
        clientId: OAuth2ClientId,
        userId: UserId
    ): Promise<void> {
        const client = await oauth2ClientService.getOAuth2ClientById(clientId);
        if (!client) throw new Error("OAuth2 client not found");

        // Tenant access check
        const tc = tenantConfig();
        if (tc) {
            const tenantId = (client as any)[tc.tenantField];
            if (tenantId) {
                try {
                    const p = "@/routes/managing-companies/managing-company.useCase";
                const mod = await import(/* webpackIgnore: true */ p);
                    await mod.managingCompanyUseCase.assertCompanyAccess(tenantId, userId, "admin");
                } catch (error: any) {
                    if (error?.code !== "MODULE_NOT_FOUND") throw error;
                }
            }
        }

        await oauth2TokenService.revokeAllClientTokens(clientId, "Client revoked by admin");
        await oauth2ClientService.revokeOAuth2Client(clientId);
    }

    /**
     * Update OAuth2 client settings (admin only)
     */
    async updateOAuth2ClientSettings(
        clientId: OAuth2ClientId,
        updateData: {
            name?: string;
            description?: string;
            role?: "viewer" | "editor" | "admin";
            scopes?: string[];
            defaultCostCenter?: number | null;
            availableCostCenters?: number[] | null;
            accessTokenTtl?: number;
            refreshTokenTtl?: number;
            maxTokensPerClient?: number;
            rateLimitPerMinute?: number;
            rateLimitPerHour?: number;
            allowedIps?: string[] | null;
            allowedOrigins?: string[] | null;
            validTo?: Date | null;
        },
        userId: UserId
    ): Promise<UnsensitiveOAuth2Client> {
        // 1. Get client and verify access
        const client = await oauth2ClientService.getOAuth2ClientById(clientId);
        if (!client) throw new Error("OAuth2 client not found");

        // Tenant access check
        const tc = tenantConfig();
        if (tc) {
            const tenantId = (client as any)[tc.tenantField];
            if (tenantId) {
                try {
                    const p = "@/routes/managing-companies/managing-company.useCase";
                const mod = await import(/* webpackIgnore: true */ p);
                    await mod.managingCompanyUseCase.assertCompanyAccess(tenantId, userId, "admin");
                } catch (error: any) {
                    if (error?.code !== "MODULE_NOT_FOUND") throw error;
                }
            }
        }

        // 2. Prevent updating revoked clients
        if (!client.isActive) {
            throw new Error(
                "Cannot update revoked OAuth2 client. Please reactivate it first."
            );
        }

        // 3. Build update object (only include provided fields)
        const updates: any = {};

        // Metadata fields
        if (updateData.name !== undefined) updates.name = updateData.name;
        if (updateData.description !== undefined) updates.description = updateData.description;

        // Security-critical fields (log changes)
        if (updateData.role !== undefined && updateData.role !== client.role) {
            updates.role = updateData.role;
        }

        if (updateData.scopes !== undefined) {
            try {
                validateScopes(updateData.scopes);
                this.assertNoEntitlementsScopesInClientConfig(updateData.scopes);
            } catch (error: any) {
                throw new Error(`Invalid scopes: ${error.message}`);
            }

            const newScopes = JSON.stringify(updateData.scopes);
            if (newScopes !== client.scopes) {
                updates.scopes = newScopes;
            }
        }

        // Cost center / resource fields (only relevant when tenant enabled)
        const tcUpdate = tenantConfig();
        if (tcUpdate && this.hasCostCenterFields(tcUpdate)) {
            if (
                updateData.defaultCostCenter !== undefined ||
                updateData.availableCostCenters !== undefined ||
                updateData.role !== undefined
            ) {
                const tenantId = (client as any)[tcUpdate.tenantField];
                const effectiveRole = (updateData.role ?? client.role) as "viewer" | "editor" | "admin";
                const effectiveDefaultCostCenter =
                    updateData.defaultCostCenter !== undefined
                        ? (updateData.defaultCostCenter ?? null)
                        : ((client.defaultCostCenter as number | null | undefined) ?? null);
                const effectiveAvailableCostCenters =
                    updateData.availableCostCenters !== undefined
                        ? (updateData.availableCostCenters ?? [])
                        : this.parseStoredCostCenters(client.availableCostCenters as any);

                const policy = await this.resolveCostCenterPolicy({
                    tenantId,
                    role: effectiveRole,
                    defaultCostCenter: effectiveDefaultCostCenter,
                    availableCostCenters: effectiveAvailableCostCenters,
                });

                updates.defaultCostCenter = policy.defaultCostCenter;
                updates.availableCostCenters = policy.availableCostCenters
                    ? JSON.stringify(policy.availableCostCenters)
                    : null;
            }
        } else {
            if (updateData.defaultCostCenter !== undefined) {
                updates.defaultCostCenter = updateData.defaultCostCenter;
            }
            if (updateData.availableCostCenters !== undefined) {
                updates.availableCostCenters = updateData.availableCostCenters
                    ? JSON.stringify(updateData.availableCostCenters)
                    : null;
            }
        }

        // Token TTL fields (only affect NEW tokens)
        if (updateData.accessTokenTtl !== undefined) {
            if (updateData.accessTokenTtl < 300 || updateData.accessTokenTtl > 86400) {
                throw new Error("accessTokenTtl must be between 300 (5 min) and 86400 (24 hours)");
            }
            updates.accessTokenTtl = updateData.accessTokenTtl;
        }

        if (updateData.refreshTokenTtl !== undefined) {
            if (updateData.refreshTokenTtl < 3600 || updateData.refreshTokenTtl > 7776000) {
                throw new Error(
                    "refreshTokenTtl must be between 3600 (1 hour) and 7776000 (90 days)"
                );
            }
            updates.refreshTokenTtl = updateData.refreshTokenTtl;
        }

        // Limits
        if (updateData.maxTokensPerClient !== undefined) {
            if (updateData.maxTokensPerClient < 1 || updateData.maxTokensPerClient > 100) {
                throw new Error("maxTokensPerClient must be between 1 and 100");
            }
            updates.maxTokensPerClient = updateData.maxTokensPerClient;
        }

        // Rate limits
        if (updateData.rateLimitPerMinute !== undefined) {
            updates.rateLimitPerMinute = updateData.rateLimitPerMinute;
        }

        if (updateData.rateLimitPerHour !== undefined) {
            updates.rateLimitPerHour = updateData.rateLimitPerHour;
        }

        // Security constraints
        if (updateData.allowedIps !== undefined) {
            updates.allowedIps = updateData.allowedIps
                ? JSON.stringify(updateData.allowedIps)
                : null;
        }

        if (updateData.allowedOrigins !== undefined) {
            updates.allowedOrigins = updateData.allowedOrigins
                ? JSON.stringify(updateData.allowedOrigins)
                : null;
        }

        // Expiry date
        if (updateData.validTo !== undefined) {
            updates.validTo = updateData.validTo;
        }

        // 4. If no updates, return current client (already without sensitive fields)
        if (Object.keys(updates).length === 0) {
            return client;
        }

        // 5. Update client in database
        const updatedClient = await oauth2ClientService.updateOAuth2Client(clientId, updates);

        return updatedClient;
    }


    getAvailableScopes(): Record<string, OAuth2Scope[]> {
        // Entitlement scopes are reserved for sync integrations and should never be exposed
        // as manually selectable client scopes in the UI.
        const hiddenScopes = this.entitlementScopes;

        const filteredGroups = Object.fromEntries(
            Object.entries(SCOPE_GROUPS)
                .map(([group, scopes]) => [group, (scopes ?? []).filter((scope) => !hiddenScopes.has(scope))])
                .filter(([, scopes]) => (scopes as OAuth2Scope[]).length > 0)
        ) as Record<string, OAuth2Scope[]>;

        return filteredGroups;
    }
}

export const oauth2UseCase = new OAuth2UseCase();

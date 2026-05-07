/**
 * OAuth2 Token Service
 *
 * Handles JWT access token and refresh token generation/validation
 * according to RFC 6749 (OAuth 2.0) and RFC 7519 (JWT).
 *
 * Token Types:
 * 1. Access Token (JWT):
 *    - Short-lived (1 hour default)
 *    - Stateless (not stored in DB)
 *    - Contains: client_id, scopes, role
 *    - Used for API authentication
 *
 * 2. Refresh Token:
 *    - Long-lived (30 days default)
 *    - Stored in DB (hashed)
 *    - Single-use (rotated on each refresh)
 *    - Used to obtain new access tokens
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import argon2 from "argon2";
import { database } from "@/db";
import { oauth2RefreshTokens, OAuth2RefreshToken, OAuth2Client } from "./oauth2-client.schema";
import { eq, and, sql, lt, gt, inArray } from "drizzle-orm";
import { nowInBerlin } from "@/util/utils";
import { logService } from "@/routes/log-service/log-service.service";
import { APP_ID } from "@/app.config";
import { OAUTH2_TENANT_CONFIG } from "./individual/oauth2-tenant.config";

/**
 * JWT Access Token Payload
 */
export interface AccessTokenPayload {
    // Standard JWT claims (RFC 7519)
    iss: string; // Issuer (your app name)
    sub: string; // Subject (client_id)
    aud: string; // Audience (your API)
    exp: number; // Expiration time (Unix timestamp)
    nbf: number; // Not before (Unix timestamp)
    iat: number; // Issued at (Unix timestamp)
    jti: string; // JWT ID (unique identifier)

    // Custom claims
    role: "viewer" | "editor" | "admin";
    scopes: string[]; // ["invoices:read", "invoices:write", etc.]

    // Tenant claims (present when OAUTH2_TENANT_CONFIG.enabled = true)
    [key: string]: unknown;
}

/**
 * JWT Refresh Token Payload
 */
export interface RefreshTokenPayload {
    // Standard JWT claims
    iss: string;
    sub: string; // client_id
    aud: string;
    exp: number;
    iat: number;
    jti: string; // Unique ID for this refresh token

    // Custom claims
    tokenType: "refresh";
}

/**
 * Token pair returned from grant
 */
export interface TokenPair {
    access_token: string;
    refresh_token: string;
    token_type: "Bearer";
    expires_in: number; // Seconds until access token expires
    scope: string; // Space-separated scopes
}

/** Legacy issuers accepted during token verification for backward compatibility */
const LEGACY_ISSUERS = ["NodeBill"];
const LEGACY_AUDIENCES = ["NodeBill API"];

class OAuth2TokenService {
    private readonly issuer = APP_ID;
    private readonly audience = `${APP_ID} API`;

    /**
     * Get JWT secret from environment
     */
    private getJwtSecret(): string {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error(
                "JWT_SECRET environment variable is required for OAuth2! " +
                "Generate with: openssl rand -base64 64"
            );
        }
        return secret;
    }

    /**
     * Get pepper for hashing refresh tokens
     *
     * NOTE: Uses the SAME pepper as API Keys for consistency!
     */
    private getPepperForVersion(version: number): string {
        // Try OAUTH2_PEPPER_V{n} first
        let pepper = process.env[`OAUTH2_PEPPER_V${version}`];

        // Fallback to API_KEY_PEPPER_V{n}
        if (!pepper) {
            pepper = process.env[`API_KEY_PEPPER_V${version}`];
        }

        if (!pepper) {
            throw new Error(
                `OAUTH2_PEPPER_V${version} or API_KEY_PEPPER_V${version} environment variable is not set! ` +
                `Set API_KEY_PEPPER_V${version}=<your-secret-pepper> ` +
                `Generate with: openssl rand -base64 64`
            );
        }
        return pepper;
    }

    private getCurrentPepperVersion(): number {
        return parseInt(process.env.OAUTH2_PEPPER_VERSION || "1", 10);
    }

    /**
     * Generate HMAC fingerprint for fast refresh token lookups
     */
    private generateFingerprint(token: string, version?: number): string {
        const pepperVersion = version ?? this.getCurrentPepperVersion();
        const pepper = this.getPepperForVersion(pepperVersion);
        return crypto.createHmac("sha256", pepper).update(token, "utf8").digest("hex");
    }

    /**
     * Generate cryptographically secure JWT ID (jti)
     */
    private generateJti(): string {
        return crypto.randomBytes(32).toString("base64url");
    }

    /**
     * Parse a JSON text column that stores a number array (e.g. availableCostCenters)
     */
    private parseJsonNumberArray(raw: unknown): number[] | null {
        if (raw === null || raw === undefined) return null;
        if (Array.isArray(raw)) return raw.map(Number).filter(v => Number.isInteger(v) && v > 0);
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.map(Number).filter(v => Number.isInteger(v) && v > 0);
            } catch { /* ignore */ }
        }
        return null;
    }

    /**
     * Create an access token (JWT)
     */
    async createAccessToken(client: OAuth2Client, scopes: string[]): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const jti = this.generateJti();

        const payload: AccessTokenPayload = {
            // Standard claims
            iss: this.issuer,
            sub: client.clientId,
            aud: this.audience,
            exp: now + client.accessTokenTtl,
            nbf: now,
            iat: now,
            jti,

            // Custom claims
            role: client.role as "viewer" | "editor" | "admin",
            scopes,
        };

        // Tenant claims (only when tenant isolation is enabled)
        if (OAUTH2_TENANT_CONFIG.enabled) {
            payload[OAUTH2_TENANT_CONFIG.tenantField] = (client as any)[OAUTH2_TENANT_CONFIG.tenantField];

            for (const rf of OAUTH2_TENANT_CONFIG.resourceFields ?? []) {
                const raw = (client as any)[rf.field];
                if (rf.type === "number[]" || rf.type === "string[]") {
                    payload[rf.field] = this.parseJsonNumberArray(raw);
                } else {
                    payload[rf.field] = raw ?? null;
                }
            }
        }

        return jwt.sign(payload as any, this.getJwtSecret(), {
            algorithm: "HS256",
        });
    }

    /**
     * Create a refresh token and store it in the database
     */
    async createRefreshToken(
        client: OAuth2Client,
        scopes: string[],
        metadata?: {
            ipAddress?: string;
            userAgent?: string;
        },
        trx = database
    ): Promise<string> {
        try {
            // 1. Check token limit per client (only count non-expired, non-revoked tokens)
            const now = nowInBerlin();
            const existingTokens = await trx
                .select({ count: sql<number>`count(*)` })
                .from(oauth2RefreshTokens)
                .where(
                    and(
                        eq(oauth2RefreshTokens.clientId, client.id),
                        eq(oauth2RefreshTokens.isRevoked, false),
                        gt(oauth2RefreshTokens.expiresAt, now)
                    )
                );

            const tokenCount = Number(existingTokens[0]?.count ?? 0);

            // Auto-revoke oldest tokens when limit is reached (FIFO rotation)
            if (tokenCount >= client.maxTokensPerClient) {
                const tokensToRevoke = tokenCount - client.maxTokensPerClient + 1;
                const oldestTokens = await trx
                    .select({ id: oauth2RefreshTokens.id })
                    .from(oauth2RefreshTokens)
                    .where(
                        and(
                            eq(oauth2RefreshTokens.clientId, client.id),
                            eq(oauth2RefreshTokens.isRevoked, false)
                        )
                    )
                    .orderBy(oauth2RefreshTokens.issuedAt)
                    .limit(tokensToRevoke);

                if (oldestTokens.length > 0) {
                    await trx
                        .update(oauth2RefreshTokens)
                        .set({ isRevoked: true, revokedAt: now, revokedReason: "auto-revoked: token limit rotation" })
                        .where(inArray(oauth2RefreshTokens.id, oldestTokens.map(t => t.id)));
                }
            }

            // 2. Generate cryptographically secure refresh token
            const refreshToken = `nbill_refresh_${crypto.randomBytes(32).toString("base64url")}`;

            // 3. Generate JTI
            const jti = this.generateJti();

            // 4. Hash the token
            const tokenHash = await argon2.hash(refreshToken, {
                type: argon2.argon2id,
                memoryCost: 65536,
                timeCost: 3,
                parallelism: 4,
            });

            // 5. Generate fingerprint
            const pepperVersion = this.getCurrentPepperVersion();
            const tokenFingerprint = this.generateFingerprint(refreshToken, pepperVersion);

            // 6. Calculate expiry
            const newNow = nowInBerlin();
            const expiresAt = new Date(newNow.getTime() + client.refreshTokenTtl * 1000);

            // 7. Store in database
            await trx.insert(oauth2RefreshTokens).values({
                clientId: client.id,
                tokenHash,
                tokenFingerprint,
                jti,
                scope: scopes.join(" "),
                expiresAt,
                ipAddress: metadata?.ipAddress ?? null,
                userAgent: metadata?.userAgent ?? null,
            });

            return refreshToken;
        } catch (error) {
            await logService.error("Error creating refresh token", { error, clientId: client.id });
            throw error;
        }
    }

    /**
     * Create a complete token pair (access + refresh)
     */
    async createTokenPair(
        client: OAuth2Client,
        scopes: string[],
        metadata?: {
            ipAddress?: string;
            userAgent?: string;
        },
        trx = database
    ): Promise<TokenPair> {
        const accessToken = await this.createAccessToken(client, scopes);
        const refreshToken = await this.createRefreshToken(client, scopes, metadata, trx);

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: "Bearer",
            expires_in: client.accessTokenTtl,
            scope: scopes.join(" "),
        };
    }

    /**
     * Verify and decode an access token
     */
    async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
        try {
            const decoded = jwt.verify(token, this.getJwtSecret(), {
                algorithms: ["HS256"],
                issuer: [this.issuer, ...LEGACY_ISSUERS],
                audience: [this.audience, ...LEGACY_AUDIENCES],
            }) as AccessTokenPayload;

            return decoded;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate a refresh token and return its metadata
     * IMPORTANT: This does NOT revoke or rotate the token - use refreshTokenRotation() for that
     */
    async validateRefreshToken(
        refreshToken: string,
        trx = database
    ): Promise<OAuth2RefreshToken | null> {
        try {
            // 1. Validate format
            if (!refreshToken.startsWith("nbill_refresh_")) {
                return null;
            }

            const now = nowInBerlin();

            // 2. Try current pepper version first
            const currentVersion = this.getCurrentPepperVersion();
            let candidates = await this.queryCandidateRefreshTokens(refreshToken, currentVersion, now, trx);

            // 3. Try other versions if needed
            if (candidates.length === 0) {
                for (let version = 1; version <= 5; version++) {
                    if (version === currentVersion) continue;
                    try {
                        candidates = await this.queryCandidateRefreshTokens(refreshToken, version, now, trx);
                        if (candidates.length > 0) break;
                    } catch (error) {
                        continue;
                    }
                }
            }

            // 4. Verify with Argon2
            for (const storedToken of candidates) {
                const isMatch = await argon2.verify(storedToken.tokenHash, refreshToken);
                if (isMatch) {
                    return storedToken;
                }
            }

            return null;
        } catch (error) {
            await logService.error("Error validating refresh token", { error });
            return null;
        }
    }

    /**
     * Helper: Query candidate refresh tokens
     */
    private async queryCandidateRefreshTokens(
        refreshToken: string,
        pepperVersion: number,
        now: Date,
        trx = database
    ): Promise<OAuth2RefreshToken[]> {
        const fingerprint = this.generateFingerprint(refreshToken, pepperVersion);

        return await trx
            .select()
            .from(oauth2RefreshTokens)
            .where(
                and(
                    eq(oauth2RefreshTokens.tokenFingerprint, fingerprint),
                    eq(oauth2RefreshTokens.isRevoked, false),
                    gt(oauth2RefreshTokens.expiresAt, now)
                )
            );
    }

    /**
     * Revoke a refresh token
     */
    async revokeRefreshToken(
        tokenId: number,
        reason?: string,
        trx = database
    ): Promise<void> {
        await trx
            .update(oauth2RefreshTokens)
            .set({
                isRevoked: true,
                revokedAt: nowInBerlin(),
                revokedReason: reason ?? null,
            })
            .where(eq(oauth2RefreshTokens.id, tokenId));
    }

    /**
     * Revoke all refresh tokens for a client
     */
    async revokeAllClientTokens(
        clientId: number,
        reason?: string,
        trx = database
    ): Promise<void> {
        await trx
            .update(oauth2RefreshTokens)
            .set({
                isRevoked: true,
                revokedAt: nowInBerlin(),
                revokedReason: reason ?? null,
            })
            .where(
                and(
                    eq(oauth2RefreshTokens.clientId, clientId),
                    eq(oauth2RefreshTokens.isRevoked, false)
                )
            );
    }

    /**
     * Update refresh token usage metadata
     */
    async trackRefreshTokenUsage(
        tokenId: number,
        trx = database
    ): Promise<void> {
        await trx
            .update(oauth2RefreshTokens)
            .set({
                lastUsedAt: nowInBerlin(),
                usageCount: sql`${oauth2RefreshTokens.usageCount} + 1`,
            })
            .where(eq(oauth2RefreshTokens.id, tokenId));
    }

    /**
     * Clean up expired refresh tokens (run this periodically via cron)
     */
    async cleanupExpiredTokens(trx = database): Promise<number> {
        const now = nowInBerlin();

        const result = await trx
            .delete(oauth2RefreshTokens)
            .where(lt(oauth2RefreshTokens.expiresAt, now))
            .returning({ id: oauth2RefreshTokens.id });

        return result.length;
    }
}

export const oauth2TokenService = new OAuth2TokenService();

/**
 * OAuth2 Client Service
 *
 * Manages OAuth2 clients with security best practices similar to API keys
 * but designed specifically for OAuth2 Client Credentials flow.
 */

import { database } from "@/db";
import {
    OAuth2Client,
    OAuth2ClientId,
    OAuth2ClientInsert,
    oauth2Clients,
    UnsensitiveOAuth2Client,
    OAuth2AuditLog,
    oauth2AuditLog,
    OAuth2AuditLogInsert,
} from "./oauth2-client.schema";
import { nowInBerlin } from "@/util/utils";
import { eq, and, sql, desc, lte, gte, isNull, or } from "drizzle-orm";
import crypto from "crypto";
import argon2 from "argon2";
import { PaginatedResult } from "@/types/types";

class OAuth2ClientService {
    /**
     * Generate a cryptographically secure client ID
     * Format: nbill_oauth2_<random>
     */
    generateClientId(): string {
        const randomBytes = crypto.randomBytes(16).toString("base64url"); // 22 chars
        return `nbill_oauth2_${randomBytes}`;
    }

    /**
     * Generate a cryptographically secure client secret
     * Format: nbill_secret_<random>
     */
    generateClientSecret(): string {
        const randomBytes = crypto.randomBytes(48).toString("base64url"); // 64 chars
        return `nbill_secret_${randomBytes}`;
    }

    /**
     * Get current pepper version
     */
    private getCurrentPepperVersion(): number {
        return parseInt(process.env.OAUTH2_PEPPER_VERSION || "1", 10);
    }

    /**
     * Get pepper for a specific version
     *
     * NOTE: Uses the SAME pepper as API Keys for consistency!
     * Both API_KEY_PEPPER_V{n} and OAUTH2_PEPPER_V{n} work.
     */
    private getPepperForVersion(version: number): string {
        // Try OAUTH2_PEPPER_V{n} first (explicit)
        let pepper = process.env[`OAUTH2_PEPPER_V${version}`];

        // Fallback to API_KEY_PEPPER_V{n} for unified config
        if (!pepper) {
            pepper = process.env[`API_KEY_PEPPER_V${version}`];
        }

        if (!pepper) {
            throw new Error(
                `OAUTH2_PEPPER_V${version} or API_KEY_PEPPER_V${version} environment variable is not set! ` +
                `Set OAUTH2_PEPPER_V${version}=<your-secret-pepper> ` +
                `Generate with: openssl rand -base64 64`
            );
        }
        return pepper;
    }

    /**
     * Generate HMAC fingerprint for fast client secret lookups
     */
    private generateFingerprint(secret: string, version?: number): string {
        const pepperVersion = version ?? this.getCurrentPepperVersion();
        const pepper = this.getPepperForVersion(pepperVersion);
        return crypto.createHmac("sha256", pepper).update(secret, "utf8").digest("hex");
    }

    /**
     * Strip sensitive fields from client object
     */
    private stripSensitiveFields(client: OAuth2Client): UnsensitiveOAuth2Client {
        const { clientSecretHash, clientSecretFingerprint, pepperVersion, ...rest } = client;
        return rest;
    }

    /**
     * Create a new OAuth2 client
     */
    async createOAuth2Client(
        data: Omit<
            OAuth2ClientInsert,
            "clientId" | "clientSecretHash" | "clientSecretFingerprint" | "pepperVersion" | "createdAt"
        >,
        trx = database
    ): Promise<{ client: UnsensitiveOAuth2Client; clientId: string; clientSecret: string }> {
        try {
            // 1. Generate client credentials
            const clientId = this.generateClientId();
            const clientSecret = this.generateClientSecret();

            // 2. Get pepper version
            const pepperVersion = this.getCurrentPepperVersion();

            // 3. Generate fingerprint
            const clientSecretFingerprint = this.generateFingerprint(clientSecret, pepperVersion);

            // 4. Hash client secret with Argon2
            const clientSecretHash = await argon2.hash(clientSecret, {
                type: argon2.argon2id,
                memoryCost: 65536,
                timeCost: 3,
                parallelism: 4,
            });

            // 5. Insert into database
            const [created] = await trx
                .insert(oauth2Clients)
                .values({
                    ...data,
                    clientId,
                    clientSecretHash,
                    clientSecretFingerprint,
                    pepperVersion,
                    createdAt: nowInBerlin(),
                })
                .returning();

            // 6. Return client WITHOUT sensitive fields + credentials (shown only once!)
            return {
                client: this.stripSensitiveFields(created),
                clientId,
                clientSecret,
            };
        } catch (error) {
            console.error("Error creating OAuth2 client:", error);
            throw error;
        }
    }

    /**
     * Get OAuth2 client by ID (without sensitive fields)
     */
    async getOAuth2ClientById(id: OAuth2ClientId, trx = database): Promise<UnsensitiveOAuth2Client | null> {
        try {
            const [client] = await trx
                .select()
                .from(oauth2Clients)
                .where(eq(oauth2Clients.id, id));

            return client ? this.stripSensitiveFields(client) : null;
        } catch (error) {
            console.error("Error fetching OAuth2 client by ID:", error);
            throw error;
        }
    }

    /**
     * Get OAuth2 client by client_id (for authentication)
     * Returns FULL client object with sensitive fields for internal use only!
     */
    async getOAuth2ClientByClientId(clientId: string, trx = database): Promise<OAuth2Client | null> {
        try {
            const [client] = await trx
                .select()
                .from(oauth2Clients)
                .where(eq(oauth2Clients.clientId, clientId));

            return client || null;
        } catch (error) {
            console.error("Error fetching OAuth2 client by client_id:", error);
            throw error;
        }
    }

    /**
     * List OAuth2 clients (paginated).
     * When managingCompanyId is provided (tenant mode), filters by tenant.
     */
    async getOAuth2ClientsByCompany(
        page: number = 1,
        pageSize: number = 10,
        trx = database,
        managingCompanyId?: number
    ): Promise<PaginatedResult<UnsensitiveOAuth2Client>> {
        const safePage = Math.max(1, page);
        const safePageSize = Math.min(100, Math.max(1, pageSize));

        const conditions = [
            eq(oauth2Clients.isActive, true),
            sql`${oauth2Clients.revokedAt} IS NULL`,
        ];
        if (managingCompanyId !== undefined) {
            conditions.push(eq(oauth2Clients.managingCompanyId, managingCompanyId));
        }
        const whereClause = and(...conditions);

        const offset = (safePage - 1) * safePageSize;

        // Count
        const [countRow] = await trx
            .select({ count: sql<number>`count(*)` })
            .from(oauth2Clients)
            .where(whereClause);

        const total = Number(countRow?.count ?? 0);
        const totalPages = Math.max(1, Math.ceil(total / safePageSize));

        // Items
        const rows = await trx
            .select()
            .from(oauth2Clients)
            .where(whereClause)
            .orderBy(desc(oauth2Clients.createdAt))
            .limit(safePageSize)
            .offset(offset);

        const items = rows.map((client) => this.stripSensitiveFields(client));

        return {
            items,
            page: safePage,
            pageSize: safePageSize,
            total,
            totalPages,
            hasNextPage: safePage < totalPages,
            hasPrevPage: safePage > 1,
        };
    }

    /**
     * Authenticate a client using client_id + client_secret
     */
    async authenticateClient(
        clientId: string,
        clientSecret: string,
        trx = database
    ): Promise<OAuth2Client | null> {
        try {
            // 1. Validate format
            if (!clientSecret.startsWith("nbill_secret_")) {
                return null;
            }

            const now = nowInBerlin();

            // 2. Try current pepper version
            const currentVersion = this.getCurrentPepperVersion();
            let candidates = await this.queryCandidateClients(clientId, clientSecret, currentVersion, now, trx);

            // 3. Try other versions if needed
            if (candidates.length === 0) {
                for (let version = 1; version <= 5; version++) {
                    if (version === currentVersion) continue;
                    try {
                        candidates = await this.queryCandidateClients(clientId, clientSecret, version, now, trx);
                        if (candidates.length > 0) break;
                    } catch (error) {
                        continue;
                    }
                }
            }

            // 4. Verify with Argon2
            for (const storedClient of candidates) {
                const isMatch = await argon2.verify(storedClient.clientSecretHash, clientSecret);
                if (isMatch) {
                    // Update last used timestamp
                    await trx
                        .update(oauth2Clients)
                        .set({ lastUsedAt: now })
                        .where(eq(oauth2Clients.id, storedClient.id));

                    return storedClient;
                }
            }

            return null;
        } catch (error) {
            console.error("Error authenticating OAuth2 client:", error);
            throw error;
        }
    }

    /**
     * Helper: Query candidate clients for authentication
     */
    private async queryCandidateClients(
        clientId: string,
        clientSecret: string,
        pepperVersion: number,
        now: Date,
        trx = database
    ): Promise<OAuth2Client[]> {
        const fingerprint = this.generateFingerprint(clientSecret, pepperVersion);

        return await trx
            .select()
            .from(oauth2Clients)
            .where(
                and(
                    eq(oauth2Clients.clientId, clientId),
                    eq(oauth2Clients.clientSecretFingerprint, fingerprint),
                    eq(oauth2Clients.pepperVersion, pepperVersion),
                    eq(oauth2Clients.isActive, true),
                    lte(oauth2Clients.validFrom, now),
                    or(isNull(oauth2Clients.validTo), gte(oauth2Clients.validTo, now)),
                    isNull(oauth2Clients.revokedAt)
                )
            );
    }

    /**
     * Update OAuth2 client metadata
     */
    async updateOAuth2Client(
        id: OAuth2ClientId,
        updates: Partial<
            Pick<
                OAuth2Client,
                | "name"
                | "description"
                | "role"
                | "scopes"
                | "defaultCostCenter"
                | "availableCostCenters"
                | "accessTokenTtl"
                | "refreshTokenTtl"
                | "maxTokensPerClient"
                | "allowedIps"
                | "allowedOrigins"
                | "rateLimitPerMinute"
                | "rateLimitPerHour"
                | "validTo"
            >
        >,
        trx = database
    ): Promise<UnsensitiveOAuth2Client> {
        try {
            const [updated] = await trx
                .update(oauth2Clients)
                .set({ ...updates, updatedAt: nowInBerlin() })
                .where(eq(oauth2Clients.id, id))
                .returning();

            if (!updated) throw new Error("OAuth2 client not found");

            return this.stripSensitiveFields(updated);
        } catch (error) {
            console.error("Error updating OAuth2 client:", error);
            throw error;
        }
    }

    /**
     * Revoke an OAuth2 client
     */
    async revokeOAuth2Client(id: OAuth2ClientId, trx = database): Promise<void> {
        await trx
            .update(oauth2Clients)
            .set({
                isActive: false,
                revokedAt: nowInBerlin(),
                updatedAt: nowInBerlin(),
            })
            .where(eq(oauth2Clients.id, id));
    }

    /**
     * Delete an OAuth2 client (hard delete - use with caution)
     */
    async deleteOAuth2Client(id: OAuth2ClientId, trx = database): Promise<void> {
        await trx.delete(oauth2Clients).where(eq(oauth2Clients.id, id));
    }

    /**
     * Log an OAuth2 request for audit trail
     */
    async logOAuth2Request(
        data: Omit<OAuth2AuditLogInsert, "timestamp">,
        trx = database
    ): Promise<void> {
        await trx.insert(oauth2AuditLog).values({
            ...data,
            timestamp: nowInBerlin(),
        });
    }

    /**
     * Get audit logs for a client
     */
    async getClientAuditLogs(
        clientId: OAuth2ClientId,
        page: number = 1,
        pageSize: number = 50,
        trx = database
    ): Promise<PaginatedResult<OAuth2AuditLog>> {
        const safePage = Math.max(1, page);
        const safePageSize = Math.min(200, Math.max(1, pageSize));
        const offset = (safePage - 1) * safePageSize;

        // Count
        const [countRow] = await trx
            .select({ count: sql<number>`count(*)` })
            .from(oauth2AuditLog)
            .where(eq(oauth2AuditLog.clientId, clientId));

        const total = Number(countRow?.count ?? 0);
        const totalPages = Math.max(1, Math.ceil(total / safePageSize));

        // Items
        const items = await trx
            .select()
            .from(oauth2AuditLog)
            .where(eq(oauth2AuditLog.clientId, clientId))
            .orderBy(desc(oauth2AuditLog.timestamp))
            .limit(safePageSize)
            .offset(offset);

        return {
            items,
            page: safePage,
            pageSize: safePageSize,
            total,
            totalPages,
            hasNextPage: safePage < totalPages,
            hasPrevPage: safePage > 1,
        };
    }
}

export const oauth2ClientService = new OAuth2ClientService();

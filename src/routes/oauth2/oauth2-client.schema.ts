/**
 * OAuth2 Client Schema
 *
 * Enterprise-grade OAuth2 Client Credentials Flow for backend-to-backend authentication.
 *
 * Standard: RFC 6749 Section 4.4 (Client Credentials Grant)
 * https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
 *
 * Use Cases:
 * - Backend services calling your API
 * - CI/CD pipelines
 * - Third-party integrations
 * - Microservices communication
 *
 * Security Features:
 * - Client secret hashing with Argon2id
 * - JWT access tokens with short expiry (1 hour default)
 * - Refresh tokens with longer expiry (30 days default)
 * - Scopes for fine-grained permissions
 * - Rate limiting per client
 * - IP whitelisting (optional)
 * - Audit logging
 */

import { pgTable, serial, integer, varchar, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

/**
 * OAuth2 Clients (similar to API Keys, but more powerful)
 *
 * Format:
 * - client_id: nbill_oauth2_<random> (public identifier)
 * - client_secret: nbill_secret_<random> (sensitive, shown only once)
 *
 * Grant Types Supported:
 * - client_credentials (RFC 6749 4.4)
 * - refresh_token (RFC 6749 6)
 */
export const oauth2Clients = pgTable("oauth2_clients", {
    id: serial("id").primaryKey(),

    // Client identification
    clientId: varchar("client_id", { length: 100 }).notNull().unique(),
    clientSecretHash: text("client_secret_hash").notNull(),
    clientSecretFingerprint: varchar("client_secret_fingerprint", { length: 64 }).notNull(), // HMAC-SHA256
    pepperVersion: integer("pepper_version").notNull().default(1), // For secret rotation

    // Metadata
    name: varchar("name", { length: 255 }).notNull(), // e.g., "Production API Client"
    description: text("description"), // e.g., "Main backend service for production"

    // Tenant isolation (only used when OAUTH2_TENANT_CONFIG.enabled = true)
    // Apps with tenants set the real ID; apps without get the default 0.
    // FK constraint is added by app-specific migration, NOT in Drizzle schema (keeps file syncable).
    managingCompanyId: integer("managing_company_id").notNull().default(0),
    defaultCostCenter: integer("default_cost_center"), // Default cost center for operations
    availableCostCenters: text("available_cost_centers"), // JSON array of allowed cost center IDs (null = all)

    // Access control
    role: varchar("role", { length: 20 }).notNull().default("viewer"), // viewer | editor | admin
    scopes: text("scopes"), // JSON array: ["invoices:read", "invoices:write", "expenses:read"]

    // Token settings
    accessTokenTtl: integer("access_token_ttl").notNull().default(3600), // Seconds (1 hour default)
    refreshTokenTtl: integer("refresh_token_ttl").notNull().default(2592000), // Seconds (30 days default)
    maxTokensPerClient: integer("max_tokens_per_client").notNull().default(10), // Max concurrent refresh tokens

    // Security
    allowedIps: text("allowed_ips"), // JSON array of whitelisted IPs (null = any)
    allowedOrigins: text("allowed_origins"), // JSON array of whitelisted origins for CORS
    rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60), // Requests per minute
    rateLimitPerHour: integer("rate_limit_per_hour").notNull().default(1000), // Requests per hour

    // Status
    isActive: boolean("is_active").notNull().default(true),
    revokedAt: timestamp("revoked_at"),
    validFrom: timestamp("valid_from").notNull().defaultNow(),
    validTo: timestamp("valid_to"), // null = no expiry

    // Audit
    createdBy: integer("created_by").notNull(), // User ID who created this client
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
    lastUsedAt: timestamp("last_used_at"), // Track last successful authentication
}, (table) => ({
    // Indexes for fast lookups
    clientIdIdx: index("oauth2_clients_client_id_idx").on(table.clientId),
    fingerprintIdx: index("oauth2_clients_fingerprint_idx").on(table.clientSecretFingerprint),
    companyIdIdx: index("oauth2_clients_company_id_idx").on(table.managingCompanyId),
}));

/**
 * OAuth2 Refresh Tokens
 *
 * Stores active refresh tokens for clients.
 * Access tokens are stateless JWTs and are not stored in the database.
 */
export const oauth2RefreshTokens = pgTable("oauth2_refresh_tokens", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
        .notNull()
        .references(() => oauth2Clients.id, { onDelete: "cascade" }),

    // Token identification
    tokenHash: text("token_hash").notNull().unique(), // Argon2 hash of refresh token
    tokenFingerprint: varchar("token_fingerprint", { length: 64 }).notNull(), // HMAC-SHA256 for fast lookup
    jti: varchar("jti", { length: 64 }).notNull().unique(), // JWT ID (unique identifier)

    // Metadata
    scope: text("scope"), // Space-separated scopes granted to this token
    issuedAt: timestamp("issued_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),

    // Security
    isRevoked: boolean("is_revoked").notNull().default(false),
    revokedAt: timestamp("revoked_at"),
    revokedReason: text("revoked_reason"),

    // Tracking
    lastUsedAt: timestamp("last_used_at"),
    usageCount: integer("usage_count").notNull().default(0),
    ipAddress: varchar("ip_address", { length: 45 }), // IPv4 or IPv6
    userAgent: text("user_agent"),
}, (table) => ({
    fingerprintIdx: index("oauth2_refresh_tokens_fingerprint_idx").on(table.tokenFingerprint),
    clientIdIdx: index("oauth2_refresh_tokens_client_id_idx").on(table.clientId),
    expiresAtIdx: index("oauth2_refresh_tokens_expires_at_idx").on(table.expiresAt),
}));

/**
 * OAuth2 Audit Log
 *
 * Tracks all OAuth2 token requests for security monitoring and compliance.
 */
export const oauth2AuditLog = pgTable("oauth2_audit_log", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
        .references(() => oauth2Clients.id, { onDelete: "set null" }),

    // Request details
    grantType: varchar("grant_type", { length: 50 }).notNull(), // client_credentials | refresh_token
    scope: text("scope"), // Requested scope
    success: boolean("success").notNull(),
    errorCode: varchar("error_code", { length: 50 }), // invalid_client | invalid_grant | etc.
    errorDescription: text("error_description"),

    // Security context
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),

    // Rate limiting metadata
    requestCount: integer("request_count"), // Requests in current window
    rateLimitExceeded: boolean("rate_limit_exceeded").default(false),
}, (table) => ({
    clientIdIdx: index("oauth2_audit_log_client_id_idx").on(table.clientId),
    timestampIdx: index("oauth2_audit_log_timestamp_idx").on(table.timestamp),
}));

// TypeScript types (using Drizzle's standard inference patterns for type generator compatibility)
export type OAuth2Client = typeof oauth2Clients.$inferSelect;
export type OAuth2ClientInsert = typeof oauth2Clients.$inferInsert;
export type OAuth2ClientId = OAuth2Client["id"];

export type OAuth2RefreshToken = typeof oauth2RefreshTokens.$inferSelect;
export type OAuth2RefreshTokenInsert = typeof oauth2RefreshTokens.$inferInsert;

export type OAuth2AuditLog = typeof oauth2AuditLog.$inferSelect;
export type OAuth2AuditLogInsert = typeof oauth2AuditLog.$inferInsert;

export type { OAuth2Scope } from "./oauth2-scopes";

/**
 * Unsensitive OAuth2 Client (without secret hash and fingerprint)
 * Safe to return to API clients
 */
export type UnsensitiveOAuth2Client = Omit<OAuth2Client, "clientSecretHash" | "clientSecretFingerprint" | "pepperVersion">;

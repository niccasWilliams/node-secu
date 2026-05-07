// INDIVIDUAL SCHEMA — Node-Secu Security Domain
// This file is NOT synced with the template.
//
// Domain-Modell für Security-Scanning, Vulnerability-Assessment und CVE-Matching.
// Tabellen-Reihenfolge folgt Abhängigkeiten: assets → authorizations → scans → jobs → findings.

import {
    boolean,
    index,
    integer,
    pgEnum,
    pgTable,
    serial,
    text,
    timestamp,
    unique,
    jsonb,
    varchar,
    uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "../schema";

// ============================================================================
// ENUMS
// ============================================================================

export const assetKindEnum = pgEnum("secu_asset_kind", [
    "domain",        // example.com
    "subdomain",     // api.example.com
    "ip",            // 192.0.2.1
    "url",           // https://example.com/login
    "host",          // mail.example.com (kein A-Record nötig — z.B. SMTP)
]);

export const authorizationKindEnum = pgEnum("secu_authorization_kind", [
    "own",                   // Eigene Infrastruktur (kein extra Proof nötig)
    "verified_ownership",    // Kunde hat per DNS-TXT/HTTP-Token bewiesen
    "written_consent",       // Unterschriebener Pentest-Vertrag (PDF in Files)
    "internal_lab",          // Internes Lab/CTF/eigene Test-Umgebung
]);

export const authorizationScopeEnum = pgEnum("secu_authorization_scope", [
    "passive_only",          // Nur passive Recon (DNS, public OSINT, TLS)
    "active_safe",            // Active scans ohne Auth-Bruteforce / Exploit (nuclei safe templates)
    "active_intrusive",       // Vollständiger Pentest inkl. Auth-Tests, sqlmap, hydra
]);

export const proofTypeEnum = pgEnum("secu_proof_type", [
    "dns_txt",               // _secu-verify.<domain> TXT mit Token
    "http_well_known",       // /.well-known/secu-verify mit Token
    "manual_admin",          // Admin-User hat zugesagt (für own assets)
    "contract_pdf",          // PDF-Vertrag in S3 hinterlegt
]);

export const scanTypeEnum = pgEnum("secu_scan_type", [
    "passive_quick",         // 30s — DNS, headers, TLS-basics, public exposure
    "passive_full",          // ~5min — + WHOIS, subdomain enum, tech detect, leak check
    "active_safe",            // ~15min — nuclei (safe), nmap (top 1000), sslyze deep
    "active_intrusive",       // 30min+ — alles inkl. wpscan, ffuf, sqlmap, hydra (auth required)
    "cve_match",             // Match aktuelle CVEs gegen erkannte Tech-Versionen
    "monitor_diff",          // Re-Scan + Diff zu letztem Scan (für Continuous Monitoring)
]);

export const scanStatusEnum = pgEnum("secu_scan_status", [
    "queued",
    "running",
    "completed",
    "failed",
    "partial",               // Einige Jobs erfolgreich, andere gefailt
    "canceled",
    "blocked",               // Abgebrochen wegen fehlender Authorization
]);

export const scanTriggerEnum = pgEnum("secu_scan_trigger", [
    "manual",                // User hat im Dashboard auf "Scan" geklickt
    "public_free",           // Anonymer Public-Scan auf der Lead-Page
    "scheduled",             // Aus scan_policies per Cron
    "api",                   // Externes System (Boss, CI/CD)
    "rescan_diff",           // Periodisch vom monitor_diff scheduler
    "cve_alert",             // Neue CVE matched → automatischer rescan
]);

export const jobStatusEnum = pgEnum("secu_job_status", [
    "pending",
    "running",
    "completed",
    "failed",
    "skipped",               // z.B. weil Authorization für aktives Tool fehlt
    "timeout",
]);

export const severityEnum = pgEnum("secu_severity", [
    "critical",              // CVSS 9.0-10.0 — sofort handeln
    "high",                  // CVSS 7.0-8.9
    "medium",                // CVSS 4.0-6.9
    "low",                   // CVSS 0.1-3.9
    "info",                  // Kein Risiko, nur informativ
]);

export const findingCategoryEnum = pgEnum("secu_finding_category", [
    "dns",                   // SPF/DKIM/DMARC/DNSSEC fehlerhaft
    "email_security",        // Email-Phishing-Risiko, Lookalike-Domains
    "tls",                   // TLS-Cipher, Cert-Issues, HSTS
    "http_headers",          // CSP, X-Frame-Options, etc.
    "exposure",              // Public exposed services, leaked secrets
    "cms",                   // WordPress, Joomla — outdated/vuln plugins
    "auth",                  // Auth-Bruteforce-Resistance, Default-Creds
    "injection",             // SQLi, XSS, Command Injection
    "cve",                   // Tech-Stack matched gegen CVE-Datenbank
    "config",                // Misconfiguration (offene Ports, debug-mode aktiv)
    "deps",                  // Outdated dependencies
    "cert",                  // Cert-Expiration, weak signing
    "phishing",              // Phishing-Domains/Lookalikes
    "leak",                  // Datenlecks, Credential-Leaks (HIBP)
]);

export const findingStatusEnum = pgEnum("secu_finding_status", [
    "open",
    "acknowledged",          // User hat gesehen, plant Fix
    "in_progress",           // Aktiv in Bearbeitung
    "resolved",              // Re-Scan bestätigt: behoben
    "wont_fix",              // Bewusst akzeptiertes Risiko
    "false_positive",        // Triage hat als FP markiert
]);

export const policyTypeEnum = pgEnum("secu_policy_type", [
    "scheduled_scan",        // Regelmäßiger Scan (z.B. wöchentlich nuclei)
    "cve_watch",             // Auto-Match neuer CVEs gegen Tech-Stack
    "cert_expiry",           // TLS-Cert läuft in <30 Tagen ab
    "domain_health",         // Tägliches Domain-Health-Monitoring
]);

export const leadStatusEnum = pgEnum("secu_lead_status", [
    "new",                   // Frisch eingegangen
    "contacted",             // Sales hat sich gemeldet
    "engaged",               // Hat aktiv geantwortet
    "converted",             // Wurde zahlender Kunde
    "rejected",              // Hat abgelehnt
    "lost",                  // Kein Response nach mehreren Tries
]);

// ============================================================================
// ASSETS — was scannen wir?
// ============================================================================

export const assets = pgTable("secu_assets", {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),

    kind: assetKindEnum("kind").notNull(),
    value: varchar("value", { length: 512 }).notNull(),    // "example.com" oder "192.0.2.1"
    label: varchar("label", { length: 255 }),               // Frei wählbarer Anzeigename

    // Internal-Use vs. Customer
    isOwnInfrastructure: boolean("is_own_infrastructure").notNull().default(false),
    tenantRef: varchar("tenant_ref", { length: 255 }),      // managingCompanyId aus AMP, optional

    // Metadata
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),

    // Lifecycle
    isActive: boolean("is_active").notNull().default(true),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    valueIdx: index("secu_assets_value_idx").on(t.value),
    ownerIdx: index("secu_assets_owner_idx").on(t.ownerUserId),
    activeIdx: index("secu_assets_active_idx").on(t.isActive),
    uniqValueOwner: uniqueIndex("secu_assets_value_owner_uniq").on(t.value, t.ownerUserId, t.kind),
}));

// ============================================================================
// AUTHORIZATIONS — was darf an einem Asset gescannt werden?
// ============================================================================

export const assetAuthorizations = pgTable("secu_asset_authorizations", {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),

    kind: authorizationKindEnum("kind").notNull(),
    scope: authorizationScopeEnum("scope").notNull(),

    // Proof
    proofType: proofTypeEnum("proof_type").notNull(),
    proofValue: text("proof_value"),                        // Token, S3-Key des PDF-Vertrags, etc.
    verifiedAt: timestamp("verified_at"),
    verificationAttempts: integer("verification_attempts").notNull().default(0),
    verificationError: text("verification_error"),

    // Lifecycle
    grantedByUserId: integer("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    revokedReason: text("revoked_reason"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    assetIdx: index("secu_auth_asset_idx").on(t.assetId),
    activeIdx: index("secu_auth_active_idx").on(t.assetId, t.scope, t.revokedAt),
}));

// ============================================================================
// SCANS — eine Scan-Session
// ============================================================================

export const scans = pgTable("secu_scans", {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),

    scanType: scanTypeEnum("scan_type").notNull(),
    trigger: scanTriggerEnum("trigger").notNull(),
    triggeredByUserId: integer("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    publicLeadId: integer("public_lead_id"),                // Falls Public-Free-Scan, FK auf publicScanLeads (siehe unten)

    // Authorization
    authorizationId: integer("authorization_id").references(() => assetAuthorizations.id, { onDelete: "set null" }),

    // Status
    status: scanStatusEnum("status").notNull().default("queued"),
    progressPercent: integer("progress_percent").notNull().default(0),

    // Timing
    queuedAt: timestamp("queued_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    timeoutAt: timestamp("timeout_at"),

    // Summary (denormalisiert für schnelles Listing)
    summary: jsonb("summary").$type<{
        criticalCount?: number;
        highCount?: number;
        mediumCount?: number;
        lowCount?: number;
        infoCount?: number;
        jobsTotal?: number;
        jobsCompleted?: number;
        jobsFailed?: number;
    }>().default({}).notNull(),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    assetIdx: index("secu_scans_asset_idx").on(t.assetId),
    statusIdx: index("secu_scans_status_idx").on(t.status),
    typeStatusIdx: index("secu_scans_type_status_idx").on(t.scanType, t.status),
    triggerIdx: index("secu_scans_trigger_idx").on(t.trigger),
}));

// ============================================================================
// SCAN_JOBS — einzelner Worker-Job innerhalb eines Scans
// ============================================================================

export const scanJobs = pgTable("secu_scan_jobs", {
    id: serial("id").primaryKey(),
    scanId: integer("scan_id").notNull().references(() => scans.id, { onDelete: "cascade" }),

    jobKey: varchar("job_key", { length: 64 }).notNull(),   // "dns", "tls", "headers", "nuclei", "nmap"
    workerVersion: varchar("worker_version", { length: 64 }), // Tool-Version für Reproducibility

    status: jobStatusEnum("status").notNull().default("pending"),

    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),

    // Output
    rawOutput: jsonb("raw_output").$type<unknown>(),         // Tool-Output, normalisiert
    findingsCount: integer("findings_count").notNull().default(0),

    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    scanIdx: index("secu_jobs_scan_idx").on(t.scanId),
    keyIdx: index("secu_jobs_key_idx").on(t.jobKey),
}));

// ============================================================================
// FINDINGS — die eigentlichen Sicherheitslücken/Konfig-Probleme
// ============================================================================

export const findings = pgTable("secu_findings", {
    id: serial("id").primaryKey(),
    scanId: integer("scan_id").references(() => scans.id, { onDelete: "set null" }),
    scanJobId: integer("scan_job_id").references(() => scanJobs.id, { onDelete: "set null" }),
    assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),

    // Deduplication
    fingerprintHash: varchar("fingerprint_hash", { length: 64 }).notNull(),

    severity: severityEnum("severity").notNull(),
    category: findingCategoryEnum("category").notNull(),

    title: varchar("title", { length: 512 }).notNull(),
    description: text("description").notNull(),
    evidence: jsonb("evidence").$type<unknown>().default({}).notNull(),
    recommendation: text("recommendation"),

    // CVE-Referenzen (falls applicable)
    cveIds: jsonb("cve_ids").$type<string[]>().default([]).notNull(),
    cvssScore: varchar("cvss_score", { length: 16 }),       // String weil "9.8" oder "N/A"

    // Status & Workflow
    status: findingStatusEnum("status").notNull().default("open"),
    statusReason: text("status_reason"),
    resolvedAt: timestamp("resolved_at"),
    resolvedByUserId: integer("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),

    // Triage (AI)
    triageConfidence: varchar("triage_confidence", { length: 16 }),  // "high" | "medium" | "low"
    triageReasoning: text("triage_reasoning"),
    triageRanAt: timestamp("triage_ran_at"),

    // Lifecycle
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    seenCount: integer("seen_count").notNull().default(1),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    assetSeverityIdx: index("secu_findings_asset_sev_idx").on(t.assetId, t.severity, t.status),
    scanIdx: index("secu_findings_scan_idx").on(t.scanId),
    fingerprintIdx: index("secu_findings_fingerprint_idx").on(t.assetId, t.fingerprintHash),
    statusIdx: index("secu_findings_status_idx").on(t.status),
    uniqAssetFingerprint: uniqueIndex("secu_findings_asset_fp_uniq").on(t.assetId, t.fingerprintHash),
}));

// ============================================================================
// TECH FINGERPRINTS — Tech-Stack pro Asset (für CVE-Matching)
// ============================================================================

export const techFingerprints = pgTable("secu_tech_fingerprints", {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    scanId: integer("scan_id").references(() => scans.id, { onDelete: "set null" }),

    // Tech identification
    techName: varchar("tech_name", { length: 128 }).notNull(),    // "nginx", "wordpress", "react"
    version: varchar("version", { length: 64 }),                   // "1.21.6", evtl. null wenn unbekannt
    cpe: varchar("cpe", { length: 256 }),                          // "cpe:2.3:a:nginx:nginx:1.21.6:*:*:*:*:*:*:*"

    // Detection
    detectionSource: varchar("detection_source", { length: 64 }).notNull(),  // "header" | "wappalyzer" | "nuclei" | "manual"
    confidence: varchar("confidence", { length: 16 }).notNull(),             // "high" | "medium" | "low"
    evidence: jsonb("evidence").$type<unknown>(),

    // Lifecycle
    firstDetectedAt: timestamp("first_detected_at").notNull().defaultNow(),
    lastDetectedAt: timestamp("last_detected_at").notNull().defaultNow(),
    currentlyPresent: boolean("currently_present").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    assetIdx: index("secu_tech_asset_idx").on(t.assetId),
    techIdx: index("secu_tech_name_idx").on(t.techName),
    cpeIdx: index("secu_tech_cpe_idx").on(t.cpe),
    uniqAssetTech: uniqueIndex("secu_tech_asset_tech_uniq").on(t.assetId, t.techName, t.version),
}));

// ============================================================================
// CVE_RECORDS — öffentliche CVE-Datenbank (synced von NVD)
// ============================================================================

export const cveRecords = pgTable("secu_cve_records", {
    cveId: varchar("cve_id", { length: 32 }).primaryKey(),  // "CVE-2024-12345"

    publishedAt: timestamp("published_at"),
    lastModifiedAt: timestamp("last_modified_at"),

    // Severity
    cvssV3Score: varchar("cvss_v3_score", { length: 16 }),
    cvssV3Vector: varchar("cvss_v3_vector", { length: 256 }),
    cvssV2Score: varchar("cvss_v2_score", { length: 16 }),
    severity: severityEnum("severity"),

    // Description
    summary: text("summary").notNull(),
    references: jsonb("references").$type<string[]>().default([]).notNull(),
    cwe: jsonb("cwe").$type<string[]>().default([]).notNull(),

    // Affected products (CPE matches)
    affectedProducts: jsonb("affected_products").$type<unknown>().default([]).notNull(),

    // Threat-Intel
    exploitedInWild: boolean("exploited_in_wild").notNull().default(false),
    exploitDbId: varchar("exploit_db_id", { length: 64 }),

    // Sync metadata
    syncedAt: timestamp("synced_at").notNull().defaultNow(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    severityIdx: index("secu_cve_severity_idx").on(t.severity),
    publishedIdx: index("secu_cve_published_idx").on(t.publishedAt),
    exploitedIdx: index("secu_cve_exploited_idx").on(t.exploitedInWild),
}));

// ============================================================================
// CVE_MATCHES — Asset×CVE matched (basierend auf tech_fingerprints)
// ============================================================================

export const cveMatches = pgTable("secu_cve_matches", {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
    techFingerprintId: integer("tech_fingerprint_id").references(() => techFingerprints.id, { onDelete: "set null" }),
    cveId: varchar("cve_id", { length: 32 }).notNull().references(() => cveRecords.cveId, { onDelete: "cascade" }),

    // Match-Details
    confidence: varchar("confidence", { length: 16 }).notNull(),        // "high" (exact CPE match) | "medium" | "low"
    matchSource: varchar("match_source", { length: 64 }).notNull(),     // "cpe_match" | "version_range" | "manual"
    matchedVersion: varchar("matched_version", { length: 64 }),

    // Linked finding (wenn CVE als finding eskaliert wurde)
    findingId: integer("finding_id").references(() => findings.id, { onDelete: "set null" }),

    // Lifecycle
    notifiedAt: timestamp("notified_at"),
    resolvedAt: timestamp("resolved_at"),
    resolvedReason: text("resolved_reason"),

    matchedAt: timestamp("matched_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    assetIdx: index("secu_cve_match_asset_idx").on(t.assetId),
    cveIdx: index("secu_cve_match_cve_idx").on(t.cveId),
    uniqAssetCve: uniqueIndex("secu_cve_match_asset_cve_uniq").on(t.assetId, t.cveId, t.matchedVersion),
}));

// ============================================================================
// SCAN_POLICIES — automatisierte Scans
// ============================================================================

export const scanPolicies = pgTable("secu_scan_policies", {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),

    name: varchar("name", { length: 255 }).notNull(),
    policyType: policyTypeEnum("policy_type").notNull(),

    // Selection
    assetSelector: jsonb("asset_selector").$type<{
        ids?: number[];
        tags?: string[];
        kind?: string[];
        ownInfrastructureOnly?: boolean;
    }>().default({}).notNull(),

    // Action
    scanType: scanTypeEnum("scan_type"),
    config: jsonb("config").$type<unknown>().default({}).notNull(),

    // Schedule
    cronSchedule: varchar("cron_schedule", { length: 64 }),    // "0 3 * * *" für daily 03:00
    isActive: boolean("is_active").notNull().default(true),

    // Lifecycle
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    lastRunStatus: varchar("last_run_status", { length: 32 }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    activeIdx: index("secu_policies_active_idx").on(t.isActive),
    nextRunIdx: index("secu_policies_next_run_idx").on(t.nextRunAt, t.isActive),
}));

// ============================================================================
// PUBLIC_SCAN_LEADS — Lead-Pipeline aus Free-Scan
// ============================================================================

export const publicScanLeads = pgTable("secu_public_scan_leads", {
    id: serial("id").primaryKey(),

    // Was wurde gescannt
    domain: varchar("domain", { length: 512 }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),               // Hash der Caller-IP für Rate-Limiting

    // Lead-Daten (optional, je nach Funnel-Stage)
    email: varchar("email", { length: 320 }),
    name: varchar("name", { length: 255 }),
    company: varchar("company", { length: 255 }),
    phone: varchar("phone", { length: 64 }),

    // Consent
    agreedToFollowup: boolean("agreed_to_followup").notNull().default(false),
    agreedAt: timestamp("agreed_at"),
    consentText: text("consent_text"),                         // Volltext der akzeptierten Erklärung

    // Funnel-Status
    status: leadStatusEnum("status").notNull().default("new"),
    statusNotes: text("status_notes"),

    // Tracking
    referrer: varchar("referrer", { length: 512 }),
    utmSource: varchar("utm_source", { length: 128 }),
    utmCampaign: varchar("utm_campaign", { length: 128 }),

    // Conversion
    convertedToCustomerAt: timestamp("converted_to_customer_at"),
    convertedAssetId: integer("converted_asset_id").references(() => assets.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
    domainIdx: index("secu_leads_domain_idx").on(t.domain),
    statusIdx: index("secu_leads_status_idx").on(t.status),
    emailIdx: index("secu_leads_email_idx").on(t.email),
    ipHashRecentIdx: index("secu_leads_ip_recent_idx").on(t.ipHash, t.createdAt),
}));

// ============================================================================
// AUDIT_LOG — was hat wer wann gegen welches Asset getan
// ============================================================================

export const securityAuditLog = pgTable("secu_audit_log", {
    id: serial("id").primaryKey(),

    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorIpHash: varchar("actor_ip_hash", { length: 64 }),

    action: varchar("action", { length: 64 }).notNull(),         // "asset.create", "scan.start", "auth.grant", "auth.revoke"
    targetType: varchar("target_type", { length: 64 }),          // "asset" | "scan" | "authorization" | "finding"
    targetId: integer("target_id"),

    payload: jsonb("payload").$type<unknown>().default({}).notNull(),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
    actorIdx: index("secu_audit_actor_idx").on(t.actorUserId, t.createdAt),
    actionIdx: index("secu_audit_action_idx").on(t.action),
    targetIdx: index("secu_audit_target_idx").on(t.targetType, t.targetId),
}));

// ============================================================================
// Type Exports — für Frontend & Service-Layer
// ============================================================================

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type AssetAuthorization = typeof assetAuthorizations.$inferSelect;
export type NewAssetAuthorization = typeof assetAuthorizations.$inferInsert;

export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;

export type ScanJob = typeof scanJobs.$inferSelect;
export type NewScanJob = typeof scanJobs.$inferInsert;

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;

export type TechFingerprint = typeof techFingerprints.$inferSelect;
export type NewTechFingerprint = typeof techFingerprints.$inferInsert;

export type CveRecord = typeof cveRecords.$inferSelect;
export type NewCveRecord = typeof cveRecords.$inferInsert;

export type CveMatch = typeof cveMatches.$inferSelect;
export type NewCveMatch = typeof cveMatches.$inferInsert;

export type ScanPolicy = typeof scanPolicies.$inferSelect;
export type NewScanPolicy = typeof scanPolicies.$inferInsert;

export type PublicScanLead = typeof publicScanLeads.$inferSelect;
export type NewPublicScanLead = typeof publicScanLeads.$inferInsert;

export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type NewSecurityAuditLog = typeof securityAuditLog.$inferInsert;

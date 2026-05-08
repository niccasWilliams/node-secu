// INDIVIDUAL SCHEMA — Node-Secu Security Domain
// This file is NOT synced with the template.
//
// Phase 1 (engagement pivot, 2026-05-08): Engagement-zentrisches Graphmodell.
//
// Globale Identitäts-Schicht (engagement-übergreifend):
//   - entities                   — globale Person/Org/Domain/IP/URL/...
//   - entity_relationships       — Beziehungen zwischen entities (objektive Fakten)
//   - entity_tags                — globale Labels
//
// Engagement-Schicht (operations-lokal):
//   - engagements                — Pentest-/Lab-Engagement (Wurzel jeder Operation)
//   - engagement_entities        — n:m Engagement ↔ Entity inkl. Rolle
//   - entity_authorizations      — wer darf was an einer Entity scannen
//   - findings                   — engagement-lokale Findings am Entity
//   - artifacts                  — Loot, Screenshots, Notizen
//   - command_history            — Replay-Spur
//   - playbook_runs              — DAG-Run im Engagement-Kontext
//   - worker_runs                — einzelner Tool-Run, Cloud-/Local-provisioniert
//   - secu_audit_log             — bekommt FK engagement_id

import {
    boolean,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    serial,
    text,
    timestamp,
    unique,
    uniqueIndex,
    varchar,
} from "drizzle-orm/pg-core";
import { users } from "../schema";

// ============================================================================
// ENUMS
// ============================================================================

export const severityEnum = pgEnum("secu_severity", [
    "critical",
    "high",
    "medium",
    "low",
    "info",
]);

export const authorizationScopeEnum = pgEnum("secu_authorization_scope", [
    "passive_only",
    "active_safe",
    "active_intrusive",
]);

export const authorizationKindEnum = pgEnum("secu_authorization_kind", [
    "own",
    "verified_ownership",
    "written_consent",
    "internal_lab",
]);

export const authorizationProofTypeEnum = pgEnum("secu_authorization_proof_type", [
    "dns_txt",
    "http_file",
    "written_contract",
    "manual_owner_verification",
    "none",
]);

export const engagementKindEnum = pgEnum("secu_engagement_kind", [
    "solo_lab",
    "ctf",
    "bug_bounty",
    "customer_pentest",
    "internal",
]);

export const engagementStatusEnum = pgEnum("secu_engagement_status", [
    "planning",
    "active",
    "paused",
    "completed",
    "archived",
]);

export const entityKindEnum = pgEnum("secu_entity_kind", [
    "asset_domain",
    "asset_subdomain",
    "asset_ip",
    "asset_host",
    "asset_url",
    "person",
    "organization",
    "location",
    "credential_ref",
    "document",
]);

export const engagementEntityRoleEnum = pgEnum("secu_engagement_entity_role", [
    "primary_target",
    "in_scope",
    "out_of_scope",
    "pivot",
    "context",
]);

export const findingStatusEnum = pgEnum("secu_finding_status", [
    "open",
    "triaged",
    "confirmed",
    "false_positive",
    "fixed",
]);

export const findingCategoryEnum = pgEnum("secu_finding_category", [
    "dns",
    "email_security",
    "tls",
    "http_headers",
    "exposure",
    "cms",
    "auth",
    "injection",
    "cve",
    "config",
    "deps",
    "cert",
    "phishing",
    "leak",
]);

export const artifactKindEnum = pgEnum("secu_artifact_kind", [
    "screenshot",
    "file",
    "command_output",
    "pcap",
    "credential_dump",
    "note",
]);

export const playbookRunStatusEnum = pgEnum("secu_playbook_run_status", [
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
]);

export const workerRunStatusEnum = pgEnum("secu_worker_run_status", [
    "pending",
    "provisioning",
    "running",
    "completed",
    "failed",
    "cancelled",
    "skipped",
]);

export const workerProviderEnum = pgEnum("secu_worker_provider", [
    "local",
    "hetzner",
    "aws",
    "digitalocean",
    "docker_host",
    "tor_proxy",
]);

// ============================================================================
// GLOBAL IDENTITY LAYER — entities, relationships, tags
// ============================================================================

/**
 * Globale Entities — engagement-übergreifend.
 *
 * Eine Person/Domain/Org existiert genau einmal. Wenn dieselbe Person in
 * mehreren Engagements auftaucht, wird sie über `engagement_entities` verlinkt.
 * Das ergibt die globale "Karte" über Kunden/Lieferanten/Tochterfirmen.
 *
 * `canonical_key` ist die normalisierte Form für Dedup:
 *   - asset_domain    → "example.com" (lowercase, ohne trailing dot)
 *   - asset_url       → vollständige normalisierte URL
 *   - person          → normalisierte Email (oder hash(name + org))
 *   - organization    → lowercased Legal-Name
 */
export const entities = pgTable("secu_entities", {
    id: serial("id").primaryKey(),

    kind: entityKindEnum("kind").notNull(),
    displayName: varchar("display_name", { length: 256 }).notNull(),
    canonicalKey: varchar("canonical_key", { length: 512 }).notNull(),

    /** Kind-spezifische Daten — z.B. {ip: "1.2.3.4"} für asset_ip, {email, role} für person. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),

    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
}, (t) => ({
    kindIdx: index("secu_entities_kind_idx").on(t.kind),
    canonicalIdx: index("secu_entities_canonical_idx").on(t.canonicalKey),
    kindCanonicalUnique: uniqueIndex("secu_entities_kind_canonical_unique").on(t.kind, t.canonicalKey),
}));

/**
 * Beziehungen zwischen Entities — global.
 *
 * Beispiele:
 *   - person → organization (kind="employs")
 *   - asset_domain → asset_ip (kind="resolves_to")
 *   - asset_url → asset_host (kind="hosted_on")
 *
 * `kind` ist absichtlich varchar (kein enum), weil neue Beziehungstypen aus
 * OSINT-Recon dynamisch entstehen können. Das Frontend kennt den festen
 * Kanon (siehe RelationshipKind-Type unten), unbekannte Werte werden generisch
 * gerendert.
 */
export const entityRelationships = pgTable("secu_entity_relationships", {
    id: serial("id").primaryKey(),

    fromEntityId: integer("from_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    toEntityId: integer("to_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),

    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** 0–100, default 100 = bestätigtes Faktum. */
    confidence: integer("confidence").notNull().default(100),
    /** "manual" | "recon_<tool>" | "osint_<source>" */
    source: varchar("source", { length: 64 }).notNull().default("manual"),

    firstObservedAt: timestamp("first_observed_at").notNull().defaultNow(),
    lastObservedAt: timestamp("last_observed_at").notNull().defaultNow(),
}, (t) => ({
    fromIdx: index("secu_rel_from_idx").on(t.fromEntityId),
    toIdx: index("secu_rel_to_idx").on(t.toEntityId),
    kindIdx: index("secu_rel_kind_idx").on(t.kind),
    tripleUnique: uniqueIndex("secu_rel_triple_unique").on(t.fromEntityId, t.toEntityId, t.kind),
}));

/**
 * Globale Tags an Entities — z.B. "high_value_target", "internal_employee".
 */
export const entityTags = pgTable("secu_entity_tags", {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 64 }).notNull(),
    color: varchar("color", { length: 16 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
    entityIdx: index("secu_entity_tags_entity_idx").on(t.entityId),
    entityTagUnique: unique("secu_entity_tags_entity_tag_unique").on(t.entityId, t.tag),
}));

// ============================================================================
// ENGAGEMENT LAYER — engagements, engagement_entities, authorizations
// ============================================================================

export const engagements = pgTable("secu_engagements", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    kind: engagementKindEnum("kind").notNull(),
    status: engagementStatusEnum("status").notNull().default("active"),
    ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    scopeSummary: text("scope_summary"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
    archivedAt: timestamp("archived_at"),
}, (t) => ({
    slugUnique: unique("secu_engagements_slug_unique").on(t.slug),
    ownerIdx: index("secu_engagements_owner_idx").on(t.ownerUserId),
    statusIdx: index("secu_engagements_status_idx").on(t.status),
}));

export const engagementEntities = pgTable("secu_engagement_entities", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    role: engagementEntityRoleEnum("role").notNull().default("in_scope"),
    notes: text("notes"),
    addedAt: timestamp("added_at").notNull().defaultNow(),
    addedBy: integer("added_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => ({
    engagementIdx: index("secu_eng_ent_engagement_idx").on(t.engagementId),
    entityIdx: index("secu_eng_ent_entity_idx").on(t.entityId),
    pairUnique: unique("secu_eng_ent_pair_unique").on(t.engagementId, t.entityId),
}));

/**
 * Authorization-Records pro Entity. Sie ersetzen die alten asset_authorizations.
 *
 * `kind` × `scope` entscheiden, welche Worker laufen dürfen. Verifizierung passiert
 * je nach `proofType`: bei DNS-TXT wird `verificationToken` gesetzt und durch
 * `domain-ownership.service.ts` geprüft; written_consent verlangt manuelle
 * Markierung (verifiedAt) durch den Operator nach Vertragsabschluss.
 */
export const entityAuthorizations = pgTable("secu_entity_authorizations", {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
    kind: authorizationKindEnum("kind").notNull(),
    scope: authorizationScopeEnum("scope").notNull(),
    proofType: authorizationProofTypeEnum("proof_type").notNull().default("none"),
    proofRef: text("proof_ref"),
    verificationToken: varchar("verification_token", { length: 128 }),
    grantedBy: integer("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    verifiedAt: timestamp("verified_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    revokedBy: integer("revoked_by").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
    entityIdx: index("secu_auth_entity_idx").on(t.entityId),
    scopeIdx: index("secu_auth_scope_idx").on(t.scope),
    activeIdx: index("secu_auth_active_idx").on(t.entityId, t.revokedAt),
}));

// ============================================================================
// FINDINGS / ARTIFACTS / COMMAND HISTORY
// ============================================================================

export const findings = pgTable("secu_findings", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id").references(() => entities.id, { onDelete: "set null" }),
    workerRunId: integer("worker_run_id"),

    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    severity: severityEnum("severity").notNull(),
    category: findingCategoryEnum("category").notNull(),
    status: findingStatusEnum("status").notNull().default("open"),

    title: varchar("title", { length: 256 }).notNull(),
    description: text("description").notNull(),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>().notNull().default({}),
    recommendation: text("recommendation"),

    cveIds: jsonb("cve_ids").$type<string[]>().notNull().default([]),
    cvssScore: varchar("cvss_score", { length: 16 }),

    discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
}, (t) => ({
    engagementIdx: index("secu_findings_engagement_idx").on(t.engagementId),
    entityIdx: index("secu_findings_entity_idx").on(t.entityId),
    statusIdx: index("secu_findings_status_idx").on(t.engagementId, t.status),
    severityIdx: index("secu_findings_severity_idx").on(t.engagementId, t.severity),
    fingerprintUnique: unique("secu_findings_engagement_fingerprint_unique").on(t.engagementId, t.fingerprint),
}));

export const artifacts = pgTable("secu_artifacts", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id").references(() => entities.id, { onDelete: "set null" }),
    kind: artifactKindEnum("kind").notNull(),
    title: varchar("title", { length: 256 }),
    body: text("body"),
    storageRef: text("storage_ref"),
    mime: varchar("mime", { length: 128 }),
    sha256: varchar("sha256", { length: 64 }),
    sizeBytes: integer("size_bytes"),
    redacted: boolean("redacted").notNull().default(false),
    capturedAt: timestamp("captured_at").notNull().defaultNow(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => ({
    engagementIdx: index("secu_artifacts_engagement_idx").on(t.engagementId),
    entityIdx: index("secu_artifacts_entity_idx").on(t.entityId),
    kindIdx: index("secu_artifacts_kind_idx").on(t.kind),
}));

export const commandHistory = pgTable("secu_command_history", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id").references(() => entities.id, { onDelete: "set null" }),
    workerRunId: integer("worker_run_id"),
    rawCommand: text("raw_command").notNull(),
    exitCode: integer("exit_code"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
}, (t) => ({
    engagementIdx: index("secu_cmd_engagement_idx").on(t.engagementId),
    workerRunIdx: index("secu_cmd_worker_run_idx").on(t.workerRunId),
}));

// ============================================================================
// PLAYBOOK / WORKER RUNS
// ============================================================================

export const playbookRuns = pgTable("secu_playbook_runs", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    playbookKey: varchar("playbook_key", { length: 64 }).notNull(),
    status: playbookRunStatusEnum("status").notNull().default("pending"),
    /** "manual" | "rule:<rule_id>" | "schedule:<cron>" */
    triggeredBy: varchar("triggered_by", { length: 128 }).notNull().default("manual"),
    triggeredByUserId: integer("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    resultSummary: jsonb("result_summary").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
    engagementIdx: index("secu_playbook_runs_engagement_idx").on(t.engagementId),
    statusIdx: index("secu_playbook_runs_status_idx").on(t.status),
    keyIdx: index("secu_playbook_runs_key_idx").on(t.playbookKey),
}));

export const workerRuns = pgTable("secu_worker_runs", {
    id: serial("id").primaryKey(),
    playbookRunId: integer("playbook_run_id").references(() => playbookRuns.id, { onDelete: "set null" }),
    engagementId: integer("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id").references(() => entities.id, { onDelete: "set null" }),
    workerKey: varchar("worker_key", { length: 64 }).notNull(),
    status: workerRunStatusEnum("status").notNull().default("pending"),
    provider: workerProviderEnum("provider").notNull().default("local"),
    providerInstanceId: varchar("provider_instance_id", { length: 128 }),
    providerRegion: varchar("provider_region", { length: 64 }),
    logsRef: text("logs_ref"),
    exitCode: integer("exit_code"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
    engagementIdx: index("secu_worker_runs_engagement_idx").on(t.engagementId),
    playbookIdx: index("secu_worker_runs_playbook_idx").on(t.playbookRunId),
    entityIdx: index("secu_worker_runs_entity_idx").on(t.entityId),
    keyIdx: index("secu_worker_runs_key_idx").on(t.workerKey),
    statusIdx: index("secu_worker_runs_status_idx").on(t.status),
}));

// ============================================================================
// AUDIT_LOG — bekommt FK auf engagement_id (nullable für globale Events)
// ============================================================================
//
// action-Beispiele:
//   "engagement.create" | "engagement.archive" | "entity.create" | "entity.link"
//   "playbook_run.start" | "playbook_run.finish" | "worker_run.start"
//   "auth.grant" | "auth.verify" | "auth.revoke"
// targetType-Werte:
//   "engagement" | "entity" | "engagement_entity" | "playbook_run"
//   "worker_run" | "finding" | "entity_authorization"

export const securityAuditLog = pgTable("secu_audit_log", {
    id: serial("id").primaryKey(),

    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorIpHash: varchar("actor_ip_hash", { length: 64 }),

    engagementId: integer("engagement_id").references(() => engagements.id, { onDelete: "set null" }),

    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 64 }),
    targetId: integer("target_id"),

    payload: jsonb("payload").$type<unknown>().default({}).notNull(),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
    actorIdx: index("secu_audit_actor_idx").on(t.actorUserId, t.createdAt),
    actionIdx: index("secu_audit_action_idx").on(t.action),
    targetIdx: index("secu_audit_target_idx").on(t.targetType, t.targetId),
    engagementIdx: index("secu_audit_engagement_idx").on(t.engagementId),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type Engagement = typeof engagements.$inferSelect;
export type NewEngagement = typeof engagements.$inferInsert;
export type EngagementKind = (typeof engagementKindEnum.enumValues)[number];
export type EngagementStatus = (typeof engagementStatusEnum.enumValues)[number];

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type EntityKind = (typeof entityKindEnum.enumValues)[number];

export type EntityRelationship = typeof entityRelationships.$inferSelect;
export type NewEntityRelationship = typeof entityRelationships.$inferInsert;

/** Bekannter Kanon der Beziehungstypen — nicht erschöpfend, OSINT kann Neue einführen. */
export type RelationshipKind =
    | "employs" | "works_with" | "subsidiary_of" | "parent_of" | "supplies"
    | "customer_of" | "member_of" | "located_at"
    | "owns_credential" | "uses_credential"
    | "owns" | "operates"
    | "resolves_to" | "hosted_on" | "runs_on"
    | "uses_tech" | "linked_to"
    | string;

export type EntityTag = typeof entityTags.$inferSelect;
export type NewEntityTag = typeof entityTags.$inferInsert;

export type EngagementEntity = typeof engagementEntities.$inferSelect;
export type NewEngagementEntity = typeof engagementEntities.$inferInsert;
export type EngagementEntityRole = (typeof engagementEntityRoleEnum.enumValues)[number];

export type EntityAuthorization = typeof entityAuthorizations.$inferSelect;
export type NewEntityAuthorization = typeof entityAuthorizations.$inferInsert;
export type AuthorizationKind = (typeof authorizationKindEnum.enumValues)[number];
export type AuthorizationScope = (typeof authorizationScopeEnum.enumValues)[number];
export type AuthorizationProofType = (typeof authorizationProofTypeEnum.enumValues)[number];

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type FindingStatus = (typeof findingStatusEnum.enumValues)[number];
export type FindingCategory = (typeof findingCategoryEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type ArtifactKind = (typeof artifactKindEnum.enumValues)[number];

export type CommandHistoryEntry = typeof commandHistory.$inferSelect;
export type NewCommandHistoryEntry = typeof commandHistory.$inferInsert;

export type PlaybookRun = typeof playbookRuns.$inferSelect;
export type NewPlaybookRun = typeof playbookRuns.$inferInsert;
export type PlaybookRunStatus = (typeof playbookRunStatusEnum.enumValues)[number];

export type WorkerRun = typeof workerRuns.$inferSelect;
export type NewWorkerRun = typeof workerRuns.$inferInsert;
export type WorkerRunStatus = (typeof workerRunStatusEnum.enumValues)[number];
export type WorkerProvider = (typeof workerProviderEnum.enumValues)[number];

export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type NewSecurityAuditLog = typeof securityAuditLog.$inferInsert;

// ============================================================================
// Hilfs-Shapes für API-Responses (engagement-graph etc.)
// ============================================================================

/** Cytoscape-kompatibler Graph-Snapshot eines Engagements. */
export type EngagementGraph = {
    engagementId: number;
    nodes: Array<{
        data: {
            id: string;
            label: string;
            kind: EntityKind;
            entityId: number;
            role: EngagementEntityRole | null;
            tags: string[];
        };
    }>;
    edges: Array<{
        data: {
            id: string;
            source: string;
            target: string;
            kind: string;
            confidence: number;
        };
    }>;
};

/** Engagement inkl. eingebettetem Graph-Snapshot — für GET /engagements/:id. */
export type EngagementWithGraph = Engagement & {
    graph: EngagementGraph;
    entityCount: number;
    findingCount: number;
};

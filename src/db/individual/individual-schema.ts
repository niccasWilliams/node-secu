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
//
// Phase 2.7 (OSINT-Identity-Layer, 2026-05-08): Identity-Graph + Provider-State.
//   - entityKindEnum erweitert   — email_address, username, phone_number, social_account
//   - engagements.osint_budget_per_hour
//   - secu_osint_provider_state  — Rate-Limit-Bookkeeping persistent
//   - secu_signal_chain_log      — Auditierbare OSINT-Chain-Spuren

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
    // Phase 2.7 — OSINT-Identity-Layer.
    // First-class identity nodes: dieselbe Email/Username/Phone/Social kann zu
    // mehreren Personen gehören → Cross-Person-Korrelationen werden im Graph
    // automatisch sichtbar.
    "email_address",
    "username",
    "phone_number",
    "social_account",
    // Sprint 1.7 (OSINT-Engine, features.md §2.8) — Infrastructure-Provider.
    // Treffer wie Cloudflare-NS, Railway-IP, Google-Analytics-Snippet werden NICHT
    // als Owner-Domain/Person interpretiert, sondern als context-Entity dieses
    // Kinds persistiert. Worker rufen `infrastructureProviderService.classifyAndPersistIfInfra()`
    // VOR jedem Cross-Domain/Owner-Pivot.
    "infrastructure_provider",
]);

/**
 * Sprint 1.7 (OSINT-Engine, features.md §2.8) — Infrastructure-Provider-Kategorien.
 *
 * Sieben harte Klassen, weil Worker je Kategorie unterschiedlich entscheiden
 * (analytics-Treffer kann ein Cross-Domain-Pivot trotzdem unterdrücken,
 * email_provider darf nicht als Owner-Email klassifiziert werden, ...).
 */
export const infrastructureProviderCategoryEnum = pgEnum("secu_infra_provider_category", [
    "dns_provider",
    "registrar",
    "hosting",
    "cdn",
    "email_provider",
    "analytics",
    "social_platform",
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
    "wont_fix",
    "fixed",
]);

/**
 * Operator-Begründung beim Triage. Steuert wie Findings im Reporting/Dashboard
 * gruppiert werden und welche Erinnerungen das Frontend zeigt (z.B. "manual_review_pending"
 * → in der Inbox sichtbar, "accepted_risk" → ausgeblendet).
 */
export const findingTriageReasonEnum = pgEnum("secu_finding_triage_reason", [
    "irrelevant_legacy",
    "compensating_control",
    "accepted_risk",
    "duplicate",
    "manual_review_pending",
    "customer_approved",
    "scoping_excluded",
    "other",
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
    // Sprint 1.6 (OSINT-Engine, features.md L11 / Mechanik #11d) — DDG/TMG §5
    // Pflichtfelder im Impressum (Name, Anschrift, Kontakt-Email, Telefon,
    // ggf. HRB/USt-IdNr). `domain_impressum_extract` erzeugt Findings dieser
    // Kategorie wenn Pflichtangaben fehlen oder das Impressum gar nicht erreichbar
    // ist. Default-Severity: missing-imprint = medium, missing-fields = low.
    "compliance_imprint",
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

/**
 * Phase 2.5 — Rule-Engine.
 *
 * Trigger-Events, auf die Rules abonniert werden können. `schedule` ist als
 * Platzhalter eingeplant (Phase 2.5+ kann cron-basiertes Feuern hinzufügen),
 * wird aktuell vom Evaluator ignoriert.
 */
export const ruleTriggerEnum = pgEnum("secu_rule_trigger", [
    "entity.created",
    "entity.updated",
    "finding.created",
    "playbook_run.completed",
    "schedule",
]);

/**
 * Action-Typen, die eine Rule auslösen kann. Jede Action hat ein eigenes
 * `params`-Schema (im JSON-Body validiert):
 *   - start_playbook  → { playbookKey, rootEntityIdFrom?, paramsTemplate? }
 *   - tag_entity      → { tag, color?, entityIdFrom? }
 *   - notify_boss     → { channel?, severityFloor?, message? }
 *   - create_finding  → { severity, category, title, descriptionTemplate, recommendation? }
 */
export const ruleActionEnum = pgEnum("secu_rule_action", [
    "start_playbook",
    "tag_entity",
    "notify_boss",
    "create_finding",
]);

/**
 * Sprint 1 (OSINT-Engine, features.md §2.1) — Operator-Hints pro Engagement.
 *
 * Pro Slot eine Zeile, damit jeder Hint einzeln referenzierbar ist:
 *   - Worker-Evidence kann `hintRefs: [12, 17]` zurücktragen (siehe §2.2 + §2.7).
 *   - PATCH/DELETE per `hintId` aus features.md greift direkt.
 *   - Audit-Log dokumentiert pro Hint-Mutation Verantwortlichen + Zeitpunkt.
 *
 * `free_text` ist absichtlich Slot statt eigene Spalte — bleibt das Modell uniform
 * und Mehrfach-Notizen (z.B. zwei verschiedene Customer-Mails) sind separat editierbar.
 */
export const engagementHintSlotEnum = pgEnum("secu_engagement_hint_slot", [
    "owner_name",
    "owner_city",
    "owner_company",
    "owner_known_email",
    "owner_known_username",
    "owner_alt_domain",
    "industry",
    "free_text",
]);

// ============================================================================
// SPRINT 1.7 — INFRASTRUCTURE-PROVIDER REGISTRY (features.md §2.8)
// ============================================================================
//
// Globale Lookup-Tabelle für bekannte Hosting-/DNS-/CDN-/Email-/Analytics-/
// Social-Provider. Jeder OSINT-Worker, der Domain-/Host-/IP-/NS-/Asset-Hits
// produziert, ruft VOR der Owner-Pivot-Logik den infrastructureProviderService
// — Treffer landen als entity.kind='infrastructure_provider' und feedback in
// die Cross-Domain-Heuristik gesperrt (siehe features.md §2.8 Begründung).
//
// `matchPatterns` ist bewusst jsonb statt N normalisierter Spalten, damit
// neue Match-Achsen (z.B. "asn_org_substring", "tls_san_pattern") ohne
// Migration ergänzbar sind.
export interface InfraProviderMatchPatterns {
    /** Suffixes für Hostnames/Domains, lowercased ohne führenden Punkt — Match wenn host endet auf .<suffix> oder ==<suffix>. */
    domainSuffixes?: string[];
    /** ASN-Nummern dieses Providers, z.B. [13335] für Cloudflare. */
    asnNumbers?: number[];
    /** IPv4-CIDR-Ranges in dotted/prefix-Notation, z.B. ["104.16.0.0/12"]. */
    cidrRanges?: string[];
    /** Suffix-Patterns für Nameserver-Hostnames, z.B. [".ns.cloudflare.com"]. */
    nsSuffixes?: string[];
    /** Hosts, von denen HTML-Tracking-Snippets/Asset-Bundles ausgeliefert werden, z.B. "www.googletagmanager.com". */
    htmlAssetHosts?: string[];
    /** Mail-Provider-Hostnames (MX-Targets, SPF-Includes), z.B. "aspmx.l.google.com". */
    emailDomains?: string[];
}

export const infrastructureProviders = pgTable("secu_infrastructure_providers", {
    id: serial("id").primaryKey(),
    /** Stable canonical key, z.B. "cloudflare-dns", "railway", "google-analytics". Operator-anlegbar. */
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    category: infrastructureProviderCategoryEnum("category").notNull(),
    matchPatterns: jsonb("match_patterns").$type<InfraProviderMatchPatterns>().notNull().default({}),
    /** Kontext für Operator-Diagnose (Quelle, Stand, Begründung). */
    dataNotes: text("data_notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
}, (t) => ({
    keyUnique: unique("secu_infra_providers_key_unique").on(t.key),
    categoryIdx: index("secu_infra_providers_category_idx").on(t.category),
    activeIdx: index("secu_infra_providers_active_idx").on(t.isActive),
}));

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
    /** Phase 2.7 — Hard-Limit für OSINT-Requests pro Stunde, geprüft vom engagement-budget.service. */
    osintBudgetPerHour: integer("osint_budget_per_hour").notNull().default(1000),
    /**
     * Sprint 1.3 (OSINT-Engine, features.md §2.4) — Auto-Chain-Hop-Limit.
     * Default = 2 (Hop 0 = Engagement-Root, Hop 1 = direkte Owner-Discovery,
     * Hop 2 = Person→Firma→deren-Domains; Hop 3+ wird nicht mehr auto-chained).
     * Operator kann pro Engagement override setzen (z.B. 3 für deep-OSINT-
     * Vertiefung oder 1 für sehr enge Engagements).
     */
    osintMaxHops: integer("osint_max_hops").notNull().default(2),
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
 * Sprint 1 (OSINT-Engine, features.md §2.1) — Hints pro Engagement.
 *
 * Worker konsumieren Hints via `hintService.getHints(engagementId)` als Seed-Material
 * (siehe `[hint-aware]`-Tag im Mechanik-Katalog). Jede Zeile = ein Hint-Wert für
 * genau einen Slot. Ein Engagement kann beliebig viele Hints derselben Slot-Sorte
 * haben (z.B. drei `owner_name`-Einträge wenn mehrere Personen vermutet werden).
 *
 * `value` ist generischer Text (Namen, Städte, Firmen, Emails, Usernames, Domains,
 * Branchen, freiform Notiz) — die Slot-Semantik macht der Konsument-Worker.
 * `source` ist optional und enthält die Herkunft des Hints im Klartext, z.B.
 *   "customer_meeting_2026-04-12" | "operator_intuition" | "prior_engagement".
 */
export const engagementHints = pgTable("secu_engagement_hints", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id")
        .notNull()
        .references(() => engagements.id, { onDelete: "cascade" }),
    slot: engagementHintSlotEnum("slot").notNull(),
    value: text("value").notNull(),
    source: varchar("source", { length: 64 }),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
}, (t) => ({
    engagementIdx: index("secu_engagement_hints_engagement_idx").on(t.engagementId),
    engagementSlotIdx: index("secu_engagement_hints_engagement_slot_idx").on(t.engagementId, t.slot),
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

    // Operator-Triage-Layer.
    // `triageReason` + `triageNote` werden gesetzt sobald der Operator den Status
    // ändert. `resolutionNote` + `resolvedAt` + `resolvedBy` füllen sich nur bei
    // den End-Status fixed/wont_fix/false_positive — daraus generiert das Reporting
    // die "Wie wurde das behoben"-Spalte.
    triageReason: findingTriageReasonEnum("triage_reason"),
    triageNote: text("triage_note"),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: "set null" }),

    discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
}, (t) => ({
    engagementIdx: index("secu_findings_engagement_idx").on(t.engagementId),
    entityIdx: index("secu_findings_entity_idx").on(t.entityId),
    statusIdx: index("secu_findings_status_idx").on(t.engagementId, t.status),
    severityIdx: index("secu_findings_severity_idx").on(t.engagementId, t.severity),
    fingerprintUnique: unique("secu_findings_engagement_fingerprint_unique").on(t.engagementId, t.fingerprint),
}));

/**
 * Kommentar-Thread pro Finding — Operator-Notizen, "warum ist das relevant",
 * "was wurde dazu geprüft". Wird im Engagement-Detail neben dem Finding angezeigt.
 */
export const findingComments = pgTable("secu_finding_comments", {
    id: serial("id").primaryKey(),
    findingId: integer("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
}, (t) => ({
    findingIdx: index("secu_finding_comments_finding_idx").on(t.findingId, t.createdAt),
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
    /**
     * Sprint 1.3 (OSINT-Engine, features.md §2.4) — Hop-Depth-Tracking.
     * Manuelle Runs = 0. Rule-getriggerte Folge-Runs = parent.hopDepth + 1.
     * Auto-Chain blockt bei `hopDepth > engagements.osintMaxHops` (default 2).
     */
    hopDepth: integer("hop_depth").notNull().default(0),
    /** Parent-Run, der diesen Run via Auto-Chain ausgelöst hat. NULL = manuell oder Schedule. */
    parentRunId: integer("parent_run_id"),
}, (t) => ({
    engagementIdx: index("secu_playbook_runs_engagement_idx").on(t.engagementId),
    statusIdx: index("secu_playbook_runs_status_idx").on(t.status),
    keyIdx: index("secu_playbook_runs_key_idx").on(t.playbookKey),
    parentIdx: index("secu_playbook_runs_parent_idx").on(t.parentRunId),
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
// RULES — Phase 2.5 deklarative Rule-Engine
// ============================================================================
//
// `scope` ist ein freitext-Pattern, weil wir ohne migrationspflichtige Enums
// drei Lanes unterstützen wollen:
//   - "global"                    → feuert in allen Engagements
//   - "engagement_kind:<kind>"    → nur Engagements dieser Art (z.B. solo_lab)
//   - "engagement:<id>"           → nur dieses eine Engagement
//
// `condition` ist eine JSON-Logic-Struktur (https://jsonlogic.com), die der
// Rule-Evaluator gegen den Event-Payload prüft. Bewusst KEIN eval / Function-
// Constructor — die Maschine ist deklarativ und auditierbar.

export const rules = pgTable("secu_rules", {
    id: serial("id").primaryKey(),

    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),

    scope: varchar("scope", { length: 64 }).notNull().default("global"),
    trigger: ruleTriggerEnum("trigger").notNull(),
    action: ruleActionEnum("action").notNull(),

    /** JSON-Logic-Struktur — Bool-Ergebnis gegen Event-Payload. `null` = immer wahr. */
    condition: jsonb("condition").$type<Record<string, unknown> | null>(),
    /** Action-spezifische Parameter (z.B. {playbookKey:"web_recon_passive"}). */
    actionParams: jsonb("action_params").$type<Record<string, unknown>>().notNull().default({}),

    enabled: boolean("enabled").notNull().default(true),

    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),

    /** Telemetrie: wie oft hat diese Rule gefeuert, wann zuletzt. */
    fireCount: integer("fire_count").notNull().default(0),
    lastFiredAt: timestamp("last_fired_at"),
}, (t) => ({
    triggerIdx: index("secu_rules_trigger_idx").on(t.trigger),
    enabledIdx: index("secu_rules_enabled_idx").on(t.enabled),
    scopeIdx: index("secu_rules_scope_idx").on(t.scope),
}));

// ============================================================================
// SPRINT 2 #7 (OSINT-Engine, features.md §3.1 Mechanik #10 + #11a) — DNS-Pivot-Tabellen
// ============================================================================
//
// Die DNS-Records-Worker-Erweiterung schreibt Cross-Domain-Indikatoren aus
// DNS-TXT (Owner-Verifications) und NS (Cloudflare-NS-Pair) in zwei dedizierte
// Pivot-Tabellen. Sprint 5 (`cross_domain_pivot_lookup`-Worker) liest sie
// zurück, um automatisch alle Engagements zu finden, die denselben Pivot teilen.
//
// Schema-Convention identisch zu späteren `secu_html_pivots` (Sprint 2 #11) —
// alle Pivot-Tabellen folgen dem Muster (engagement, entity, idType, idValue,
// source, foundAt) damit die Cross-Pivot-Engine generisch über alle Pivot-
// Klassen joinen kann.

/**
 * Bekannte DNS-TXT-Verification-Token-Typen werden als Slug-String in `idType`
 * persistiert. Convention-Liste: google_site_verification | ms365 | atlassian |
 * apple_domain | facebook_domain | github_domain | adobe_idp | docusign |
 * stripe | zoom | webex | other. KEIN pgEnum, weil neue Provider laufend
 * dazukommen — Worker fällt bei unbekannten Mustern auf "other" zurück.
 */
export const dnsVerificationPivots = pgTable("secu_dns_verification_pivots", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id")
        .notNull()
        .references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
        .notNull()
        .references(() => entities.id, { onDelete: "cascade" }),
    idType: varchar("id_type", { length: 64 }).notNull(),
    /** Roher Token-Wert wie im DNS, ohne Provider-Präfix; case-preserved (Token sind case-sensitive). */
    idValue: varchar("id_value", { length: 256 }).notNull(),
    /** Z.B. "TXT@example.com" — für Operator-Diagnose. */
    source: varchar("source", { length: 128 }).notNull(),
    foundAt: timestamp("found_at").notNull().defaultNow(),
}, (t) => ({
    engagementIdx: index("secu_dns_verification_pivots_engagement_idx").on(t.engagementId),
    entityIdx: index("secu_dns_verification_pivots_entity_idx").on(t.entityId),
    /** Cross-Engagement-Lookup-Index — DER Hot-Path für Sprint 5. */
    typeValueIdx: index("secu_dns_verification_pivots_type_value_idx").on(t.idType, t.idValue),
    /** Idempotenter Insert pro (Entity, Token-Type, Token-Value) — Worker-Re-Runs deduplizieren automatisch. */
    entityTypeValueUnique: unique("secu_dns_verification_pivots_entity_type_value_unique").on(t.entityId, t.idType, t.idValue),
}));

/**
 * Sprint 2 #11 (features.md §3.2 Mechanik #12-#16c) — HTML-Pivot-Tabelle für
 * Tracking-IDs, Build-Asset-Hashes und Custom-App-Identifier, die domain-
 * übergreifend dieselbe Codebase identifizieren. Gleiche Schema-Convention
 * wie die DNS-Pivot-Tabellen.
 *
 * idType-Convention (extensible, kein pgEnum):
 *   - google_analytics_ua | google_analytics_ga4 | google_tag_manager
 *   - facebook_pixel | hotjar | matomo | yandex_metrika | ms_clarity
 *   - sentry_dsn | stripe_publishable_key | mapbox_token | mailchimp_list_id
 *   - recaptcha_site_key | plausible_domain
 *   - webpack_chunk_hash | next_chunk_hash | vite_asset_hash | sveltekit_chunk_hash
 *
 * Webpack/Next-Chunk-Hashes sind die STÄRKSTEN Cross-Domain-Signale (Live-Test
 * fand 8 gemeinsame Chunks zwischen orvello und niccaswilliams = quasi sicher
 * dieselbe Codebase). Tracking-IDs sind kopierbar (jemand könnte fremde GTM-ID
 * auf eigener Seite einbauen) — Build-Hashes nicht, das wäre Compile-Match.
 */
export const htmlPivots = pgTable("secu_html_pivots", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id")
        .notNull()
        .references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
        .notNull()
        .references(() => entities.id, { onDelete: "cascade" }),
    idType: varchar("id_type", { length: 64 }).notNull(),
    idValue: varchar("id_value", { length: 256 }).notNull(),
    /** URL, in der der Pivot gefunden wurde — Operator-Diagnose. */
    sourceUrl: varchar("source_url", { length: 512 }).notNull(),
    foundAt: timestamp("found_at").notNull().defaultNow(),
}, (t) => ({
    engagementIdx: index("secu_html_pivots_engagement_idx").on(t.engagementId),
    entityIdx: index("secu_html_pivots_entity_idx").on(t.entityId),
    typeValueIdx: index("secu_html_pivots_type_value_idx").on(t.idType, t.idValue),
    entityTypeValueUnique: unique("secu_html_pivots_entity_type_value_unique").on(t.entityId, t.idType, t.idValue),
}));

/**
 * NS-Pair-Pivot-Tabelle — primär für Cloudflare-NS-Pair (zwei NS-Records
 * derselben Form `*.ns.cloudflare.com`, der lexikografisch sortierte
 * Pair-String identifiziert eindeutig einen CF-Account). Andere DNS-Provider
 * vergeben i.d.R. shared NS — dort kommt `idType='shared_ns'` rein, und der
 * Sprint-5-Pivot-Worker filtert die als nicht-pivottauglich raus (siehe §2.8).
 */
export const dnsNsPivots = pgTable("secu_dns_ns_pivots", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id")
        .notNull()
        .references(() => engagements.id, { onDelete: "cascade" }),
    entityId: integer("entity_id")
        .notNull()
        .references(() => entities.id, { onDelete: "cascade" }),
    /** `cloudflare_ns_pair` für CF-spezifische Pair-Eindeutigkeit; `shared_ns` für gewöhnliche Provider-NS. */
    idType: varchar("id_type", { length: 64 }).notNull(),
    /** Sortiertes Pair (z.B. "leonidas.ns.cloudflare.com|teagan.ns.cloudflare.com") oder Single-NS-Host. */
    idValue: varchar("id_value", { length: 512 }).notNull(),
    source: varchar("source", { length: 128 }).notNull(),
    foundAt: timestamp("found_at").notNull().defaultNow(),
}, (t) => ({
    engagementIdx: index("secu_dns_ns_pivots_engagement_idx").on(t.engagementId),
    entityIdx: index("secu_dns_ns_pivots_entity_idx").on(t.entityId),
    typeValueIdx: index("secu_dns_ns_pivots_type_value_idx").on(t.idType, t.idValue),
    entityTypeValueUnique: unique("secu_dns_ns_pivots_entity_type_value_unique").on(t.entityId, t.idType, t.idValue),
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
// Phase 2.7 — OSINT Provider State + Signal Chain Log
// ============================================================================

/**
 * Provider-Rate-Limit-Bookkeeping. Pro `provider_key` (z.B. "gravatar", "github",
 * "crt.sh", "hibp", "holehe-adobe") wird Counter + 429-Backoff persistent gehalten
 * — überlebt App-Restarts, sodass Provider-Quotas nicht durch Re-Starts geleakt
 * werden.
 */
export const secuOsintProviderState = pgTable("secu_osint_provider_state", {
    id: serial("id").primaryKey(),
    providerKey: varchar("provider_key", { length: 64 }).notNull(),
    /** Sliding-Window-Counter — wird vom limiter rotiert wenn windowStart älter als die Window-Dauer ist. */
    requestCount: integer("request_count").notNull().default(0),
    windowStart: timestamp("window_start").notNull().defaultNow(),
    lastRequestAt: timestamp("last_request_at"),
    last429At: timestamp("last_429_at"),
    /** Wenn gesetzt und in Zukunft → Worker skippen mit error="provider_paused:..." */
    pausedUntil: timestamp("paused_until"),
    /** Kontext für die letzte 429/Fehler-Meldung — Operator-Diagnose. */
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at"),
}, (t) => ({
    providerKeyUnique: unique("secu_osint_provider_state_key_unique").on(t.providerKey),
}));

/**
 * Auditierbare OSINT-Chain-Spur. Phase 2.7 schreibt pro chained Run einen Eintrag
 * — "aus Email X via gravatar+github+holehe haben wir N Signale gefunden". Phase 6
 * Reporting kann darauf direkt eine "Signal-Map"-Visualisierung bauen.
 */
export const secuSignalChainLog = pgTable("secu_signal_chain_log", {
    id: serial("id").primaryKey(),
    engagementId: integer("engagement_id").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    rootEntityId: integer("root_entity_id").references(() => entities.id, { onDelete: "set null" }),
    /** Trigger der Chain — manuell, rule-id oder playbook-key. */
    triggeredBy: varchar("triggered_by", { length: 64 }).notNull().default("manual"),
    /**
     * jsonb-Array: [{ step, provider, foundEntityIds[], findingIds[], ms, status }]
     * — pro Step ein Eintrag in chronologischer Reihenfolge.
     */
    signalChain: jsonb("signal_chain").$type<Array<Record<string, unknown>>>().notNull().default([]),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
}, (t) => ({
    engagementIdx: index("secu_signal_chain_engagement_idx").on(t.engagementId),
    rootIdx: index("secu_signal_chain_root_idx").on(t.rootEntityId),
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

export type EngagementHint = typeof engagementHints.$inferSelect;
export type NewEngagementHint = typeof engagementHints.$inferInsert;
export type EngagementHintSlot = (typeof engagementHintSlotEnum.enumValues)[number];

export type EntityAuthorization = typeof entityAuthorizations.$inferSelect;
export type NewEntityAuthorization = typeof entityAuthorizations.$inferInsert;
export type AuthorizationKind = (typeof authorizationKindEnum.enumValues)[number];
export type AuthorizationScope = (typeof authorizationScopeEnum.enumValues)[number];
export type AuthorizationProofType = (typeof authorizationProofTypeEnum.enumValues)[number];

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;
export type FindingStatus = (typeof findingStatusEnum.enumValues)[number];
export type FindingCategory = (typeof findingCategoryEnum.enumValues)[number];
export type FindingTriageReason = (typeof findingTriageReasonEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];

export type FindingComment = typeof findingComments.$inferSelect;
export type NewFindingComment = typeof findingComments.$inferInsert;

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

export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
export type RuleTrigger = (typeof ruleTriggerEnum.enumValues)[number];
export type RuleAction = (typeof ruleActionEnum.enumValues)[number];

export type OsintProviderState = typeof secuOsintProviderState.$inferSelect;
export type NewOsintProviderState = typeof secuOsintProviderState.$inferInsert;

export type SignalChainLog = typeof secuSignalChainLog.$inferSelect;
export type NewSignalChainLog = typeof secuSignalChainLog.$inferInsert;

export type InfrastructureProvider = typeof infrastructureProviders.$inferSelect;
export type NewInfrastructureProvider = typeof infrastructureProviders.$inferInsert;
export type InfrastructureProviderCategory = (typeof infrastructureProviderCategoryEnum.enumValues)[number];

export type DnsVerificationPivot = typeof dnsVerificationPivots.$inferSelect;
export type NewDnsVerificationPivot = typeof dnsVerificationPivots.$inferInsert;
export type DnsNsPivot = typeof dnsNsPivots.$inferSelect;
export type NewDnsNsPivot = typeof dnsNsPivots.$inferInsert;
export type HtmlPivot = typeof htmlPivots.$inferSelect;
export type NewHtmlPivot = typeof htmlPivots.$inferInsert;

// ============================================================================
// Sprint 1.2 (OSINT-Engine, features.md §2.2 + §2.7) — Speculative-Entities
// + Confidence-Score + Provenance-Class.
// ============================================================================
//
// Optionaler Provenance-Block in `entities.data.provenance`. Wird vom
// `confidenceService.aggregate()` (src/lib/security/entities/confidence.ts)
// gepflegt. Worker liefern Evidence-Items über
// `DiscoveredEntityDraft.evidence[]` — der playbook-runner mergt sie via
// confidenceService in die Entity, recomputed Confidence + Speculative-Flag.
//
// Default für Entities OHNE Provenance-Block = factual (worker-aufgeführte
// Discoveries wie "DNS-A-Resolution" tragen kein Provenance — sie sind
// reine Fakten). Der Block taucht erst auf, sobald ein Worker explizit
// Belege mitliefert (Owner-Discovery, Cross-Domain-Pivot, OSINT-Hypothese).

export type EntityEvidenceClass = "organic" | "hint_seeded";

export interface EntityEvidenceItem {
    /**
     * Free-text Quellen-Identifier — Konvention: `<worker>:<sub-source>` wenn
     * sinnvoll (z.B. `domain_impressum_extract:html_body`, `domain_whois_passive:rdap`,
     * `search_engine_recon:searxng`, `hint:owner_name`).
     */
    source: string;
    /** workerKey aus worker.types — für Re-Scan-Audit (welcher Worker hat den Beleg geliefert). */
    workerKey?: string;
    /** secu_worker_runs.id falls bekannt. */
    workerRunId?: number;
    foundAt: string;
    /** Wörtliches Zitat oder kurze Tatsachen-Aussage ("Pilz, Niclas — Geschäftsführer"). */
    snippet?: string;
    /** 0.0..1.0 — wie stark dieser eine Beleg alleine die Confidence anhebt. */
    confidenceContribution: number;
    evidenceClass: EntityEvidenceClass;
    /** Nur wenn evidenceClass='hint_seeded': IDs der genutzten secu_engagement_hints. */
    hintRefs?: number[];
}

export interface EntityConflict {
    source: string;
    claim: string;
    observedAt: string;
}

export interface EntityProvenance {
    /** false = verifiziert/faktisch, true = Hypothese (siehe §2.2/§2.5). */
    speculative: boolean;
    /** Aggregierter Vertrauens-Score 0.0..1.0 (computed by confidence.ts). */
    confidence: number;
    /** Chronologisch geordnete Liste aller Belege. */
    evidence: EntityEvidenceItem[];
    /** Quellen-Widersprüche — kein Auto-Merge, Operator entscheidet. */
    conflicts: EntityConflict[];
    /** ISO8601 — letzter Aggregator-Lauf, für Diagnose/Debug. */
    recomputedAt: string;
}

/** entity.data-Shape für entity.kind='infrastructure_provider'. */
export interface InfrastructureProviderEntityData {
    providerId: number;
    providerKey: string;
    providerName: string;
    category: InfrastructureProviderCategory;
    matchedVia: "domain" | "asn" | "cidr" | "ns_host" | "html_asset_host" | "email_domain";
    /** Was hat gematched, z.B. "cloudflare.com" oder "104.16.0.0/12". */
    matchPattern: string;
    /** Wer/wo wurde der Treffer beobachtet, z.B. "dns_records:NS=leonidas.ns.cloudflare.com" für Operator-Diagnose. */
    matchSource?: string;
    /** Wann zuletzt von einem Worker als infra-Treffer beobachtet — kein autoChain-Trigger. */
    lastObservedAt?: string;
}

/** Per-Kind data-Shape für entities.data. Wird in TS getypt, in DB als jsonb persistiert. */
export interface EmailAddressEntityData {
    local: string;
    domain: string;
    mxValid?: boolean | null;
    mxHosts?: string[];
    spfRecord?: string | null;
    dmarcPolicy?: string | null;
    dkimSelectorsFound?: string[];
    gravatarHash?: string;
    gravatarFound?: boolean;
    gravatarProfileUrl?: string | null;
    pwnedSources?: string[];
    lastValidatedAt?: string | null;
}

export interface UsernameEntityData {
    value: string;
    normalized: string;
    observedPlatforms?: string[];
}

export interface PhoneNumberEntityData {
    e164: string;
    region?: string | null;
    type?: "mobile" | "landline" | "voip" | "unknown";
    carrier?: string | null;
}

export interface SocialAccountEntityData {
    platform: string;
    handle: string;
    profileUrl: string;
    verified?: boolean;
    lastSeenAt?: string;
    displayName?: string | null;
    bio?: string | null;
    followerCount?: number | null;
}

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

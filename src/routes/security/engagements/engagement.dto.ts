import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import { paginatedQuery } from "@/api-contract/pagination.dto";

const engagementKind = z.enum(["solo_lab", "ctf", "bug_bounty", "customer_pentest", "internal"]);
ui(engagementKind, {
    label: "Art",
    widget: "select",
    group: "Allgemein",
    options: [
        { value: "solo_lab", label: "Solo-Lab", description: "Eigene Test-Infrastruktur", color: "neutral" },
        { value: "ctf", label: "CTF", description: "Capture-the-Flag-Challenge", color: "info" },
        { value: "bug_bounty", label: "Bug Bounty", description: "Bug-Bounty-Programm", color: "info" },
        { value: "customer_pentest", label: "Kunden-Pentest", description: "Beauftragter Pentest", color: "success" },
        { value: "internal", label: "Intern", description: "Eigene Infrastruktur", color: "neutral" },
    ],
});

const engagementStatus = z.enum(["planning", "active", "paused", "completed", "archived"]);
ui(engagementStatus, {
    label: "Status",
    widget: "select",
    group: "Allgemein",
    options: [
        { value: "planning", label: "Planung", color: "neutral" },
        { value: "active", label: "Aktiv", color: "success" },
        { value: "paused", label: "Pausiert", color: "warning" },
        { value: "completed", label: "Abgeschlossen", color: "info" },
        { value: "archived", label: "Archiviert", color: "neutral" },
    ],
});

const entityRole = z.enum(["primary_target", "in_scope", "out_of_scope", "pivot", "context"]);
ui(entityRole, {
    label: "Rolle",
    widget: "select",
    group: "Verlinkung",
    options: [
        { value: "primary_target", label: "Primärziel", color: "danger" },
        { value: "in_scope", label: "In Scope", color: "success" },
        { value: "out_of_scope", label: "Out of Scope", color: "neutral" },
        { value: "pivot", label: "Pivot", color: "warning" },
        { value: "context", label: "Kontext", color: "info" },
    ],
});

const entityKind = z.enum([
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
    "email_address",
    "username",
    "phone_number",
    "social_account",
    "infrastructure_provider",
]);
ui(entityKind, { label: "Entity-Typ", widget: "select", group: "Identität" });

const authKind = z.enum(["own", "verified_ownership", "written_consent", "internal_lab"]);
ui(authKind, {
    label: "Autorisierungsart",
    widget: "select",
    group: "Berechtigung",
    help: "Auf welcher rechtlichen Basis darf gescannt werden?",
    options: [
        { value: "own", label: "Eigene Infrastruktur", color: "success" },
        { value: "verified_ownership", label: "DNS/HTTP-verifiziert", color: "info" },
        { value: "written_consent", label: "Schriftlicher Pentest-Auftrag", color: "success" },
        { value: "internal_lab", label: "Internes Lab (Dev only)", color: "warning" },
    ],
});

const authScope = z.enum(["passive_only", "active_safe", "active_intrusive"]);
ui(authScope, {
    label: "Erlaubter Scan-Umfang",
    widget: "select",
    group: "Berechtigung",
    options: [
        { value: "passive_only", label: "Nur passiv", color: "neutral", description: "DNS, Header, TLS-Lookup — kein aktiver Traffic" },
        { value: "active_safe", label: "Aktiv – sicher", color: "warning", description: "nuclei (safe-tags), nmap top1000, testssl" },
        { value: "active_intrusive", label: "Aktiv – intrusiv", color: "danger", description: "wpscan, sqlmap, hydra — nur mit schriftlichem Auftrag" },
    ],
});

const authProofType = z.enum([
    "dns_txt",
    "http_file",
    "written_contract",
    "manual_owner_verification",
    "none",
]);
ui(authProofType, { label: "Nachweistyp", widget: "select", group: "Berechtigung" });

export const engagementCreateBodySchema = z
    .object({
        name: ui(z.string().min(1).max(256), {
            label: "Name",
            widget: "text",
            group: "Allgemein",
            placeholder: "z.B. ACME GmbH Pentest 2026",
            order: 10,
        }),
        kind: engagementKind,
        status: engagementStatus.optional(),
        scopeSummary: ui(z.string().max(8192).optional(), {
            label: "Scope-Zusammenfassung",
            widget: "textarea",
            group: "Allgemein",
            help: "Kurze Beschreibung des Auftragsumfangs (Markdown).",
        }),
        primaryDomain: ui(
            z.string().min(1).max(256).regex(/^[a-zA-Z0-9.-]+$/, "primaryDomain must be a bare hostname").optional(),
            {
                label: "Primär-Domain",
                widget: "domain",
                group: "Bootstrap",
                help: "Wird beim Anlegen automatisch als asset_domain-Entity erzeugt und verlinkt.",
                placeholder: "example.com",
            },
        ),
    })
    .strict();

export const engagementUpdateBodySchema = z
    .object({
        name: ui(z.string().min(1).max(256).optional(), { label: "Name", widget: "text", group: "Allgemein" }),
        status: engagementStatus.optional(),
        scopeSummary: ui(z.string().max(8192).nullable().optional(), {
            label: "Scope-Zusammenfassung",
            widget: "textarea",
            group: "Allgemein",
        }),
    })
    .strict();

// Akzeptiert sowohl `?kind=bug_bounty` als auch `?kind=bug_bounty,customer_pentest`.
// Validiert jedes Element gegen das engagementKind-Enum; ungültige Werte fallen weg.
const engagementKindCsv = z
    .string()
    .max(256)
    .optional()
    .transform((v) => {
        if (!v) return undefined;
        const parsed = v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .filter((s): s is z.infer<typeof engagementKind> => engagementKind.safeParse(s).success);
        return parsed.length === 0 ? undefined : parsed;
    });

export const engagementListQuerySchema = paginatedQuery({
    sortFields: ["createdAt", "updatedAt", "name", "status"] as const,
    defaultSort: "createdAt",
    defaultOrder: "desc",
}).extend({
    includeArchived: ui(z.coerce.boolean().optional(), {
        label: "Archivierte einschließen",
        widget: "checkbox",
        group: "Filter",
    }),
    kind: ui(engagementKindCsv, {
        label: "Art (CSV)",
        widget: "text",
        group: "Filter",
        help: "Eine oder mehrere Engagement-Arten, kommasepariert.",
    }),
    ownerUserId: z.coerce.number().int().positive().optional(),
});

export const engagementParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const engagementEntityLinkBodySchema = z
    .object({
        entityId: ui(z.number().int().positive().optional(), {
            label: "Entity",
            widget: "entity-picker",
            group: "Verlinkung",
            help: "Existierende Entity verlinken — oder unten eine neue anlegen.",
        }),
        upsert: z
            .object({
                kind: entityKind,
                primaryValue: ui(z.string().min(1).max(512), {
                    label: "Primärwert",
                    widget: "text",
                    group: "Neue Entity",
                    placeholder: "z.B. example.com / john@example.com / +49…",
                }),
                displayName: ui(z.string().min(1).max(256).optional(), {
                    label: "Anzeigename",
                    widget: "text",
                    group: "Neue Entity",
                }),
                discriminator: z.string().max(256).nullable().optional(),
                data: ui(z.record(z.unknown()).optional(), {
                    label: "Strukturierte Daten",
                    widget: "json",
                    group: "Neue Entity",
                }),
            })
            .optional(),
        role: entityRole.optional(),
        notes: ui(z.string().max(4096).nullable().optional(), {
            label: "Notiz",
            widget: "textarea",
            group: "Verlinkung",
        }),
    })
    .strict()
    .refine((v) => v.entityId != null || v.upsert != null, {
        message: "Either entityId or upsert is required",
    });

export const engagementEntityListQuerySchema = z
    .object({
        kind: entityKind.optional(),
    })
    .strict();

export const engagementEntityParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
    entityId: z.coerce.number().int().positive(),
});

export const engagementNoteBodySchema = z
    .object({
        body: ui(z.string().min(1).max(65536), {
            label: "Inhalt",
            widget: "textarea",
            group: "Notiz",
            placeholder: "Markdown unterstützt.",
        }),
        title: ui(z.string().max(256).optional(), { label: "Titel", widget: "text", group: "Notiz" }),
        entityId: ui(z.number().int().positive().nullable().optional(), {
            label: "Verknüpfte Entity",
            widget: "entity-picker",
            group: "Notiz",
            help: "Optional: Notiz an eine konkrete Entity hängen.",
        }),
    })
    .strict();

// Phase 2.7 — OSINT-Specific endpoints
export const osintEmailEntityBodySchema = z
    .object({
        email: ui(z.string().email().max(320), {
            label: "E-Mail-Adresse",
            widget: "email",
            group: "OSINT",
            placeholder: "user@example.com",
        }),
        personId: ui(z.number().int().positive().nullable().optional(), {
            label: "Verknüpfte Person",
            widget: "entity-picker",
            group: "OSINT",
            help: "Optional: an existierende Person-Entity hängen.",
        }),
    })
    .strict();
export type OsintEmailEntityBody = z.infer<typeof osintEmailEntityBodySchema>;

export const grantAuthBodySchema = z
    .object({
        entityId: ui(z.number().int().positive(), {
            label: "Entity",
            widget: "entity-picker",
            group: "Berechtigung",
            help: "Welche Asset-Entity wird autorisiert?",
            order: 10,
        }),
        kind: authKind,
        scope: authScope,
        proofType: authProofType.optional(),
        proofRef: ui(z.string().max(2048).nullable().optional(), {
            label: "Nachweis-Referenz",
            widget: "text",
            group: "Berechtigung",
            placeholder: "z.B. DNS-TXT-Token, Vertrag-ID",
        }),
        verifiedAt: ui(z.coerce.date().nullable().optional(), {
            label: "Verifiziert am",
            widget: "datetime",
            group: "Zeiträume",
        }),
        expiresAt: ui(z.coerce.date().nullable().optional(), {
            label: "Läuft ab am",
            widget: "datetime",
            group: "Zeiträume",
            help: "Leer = unbegrenzt gültig.",
        }),
        notes: ui(z.string().max(4096).nullable().optional(), {
            label: "Notizen",
            widget: "textarea",
            group: "Berechtigung",
        }),
    })
    .strict();

export const engagementAuthorizationParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
    authorizationId: z.coerce.number().int().positive(),
});

export type EngagementCreateBody = z.infer<typeof engagementCreateBodySchema>;
export type EngagementUpdateBody = z.infer<typeof engagementUpdateBodySchema>;
export type EngagementListQuery = z.infer<typeof engagementListQuerySchema>;
export type EngagementEntityLinkBody = z.infer<typeof engagementEntityLinkBodySchema>;
export type EngagementNoteBody = z.infer<typeof engagementNoteBodySchema>;
export type GrantAuthBody = z.infer<typeof grantAuthBodySchema>;

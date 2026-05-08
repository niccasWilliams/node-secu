import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import { paginatedQuery } from "@/api-contract/pagination.dto";

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

export const entityCreateBodySchema = z
    .object({
        kind: entityKind,
        primaryValue: ui(z.string().min(1).max(512), {
            label: "Primärwert",
            widget: "text",
            group: "Identität",
            placeholder: "z.B. example.com / john@example.com",
            order: 10,
        }),
        displayName: ui(z.string().min(1).max(256).optional(), {
            label: "Anzeigename",
            widget: "text",
            group: "Identität",
        }),
        discriminator: ui(z.string().max(256).nullable().optional(), {
            label: "Diskriminator",
            widget: "text",
            group: "Identität",
            help: "Optional, falls primaryValue allein nicht eindeutig ist.",
        }),
        data: ui(z.record(z.unknown()).optional(), {
            label: "Strukturierte Daten",
            widget: "json",
            group: "Identität",
        }),
    })
    .strict();

export const entityListQuerySchema = paginatedQuery({
    sortFields: ["firstSeenAt", "lastSeenAt", "displayName", "kind"] as const,
    defaultSort: "lastSeenAt",
    defaultOrder: "desc",
}).extend({
    kind: entityKind.optional(),
    q: ui(z.string().max(256).optional(), {
        label: "Suche",
        widget: "text",
        group: "Filter",
        placeholder: "Volltext-Suche…",
    }),
    includeSpeculative: ui(z.coerce.boolean().optional(), {
        label: "Spekulative Entities einschließen",
        widget: "checkbox",
        group: "Filter",
    }),
});

export const entityParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const entityRelationshipBodySchema = z
    .object({
        toEntityId: ui(z.number().int().positive(), {
            label: "Ziel-Entity",
            widget: "entity-picker",
            group: "Beziehung",
            order: 10,
        }),
        kind: ui(z.string().min(1).max(64), {
            label: "Beziehungsart",
            widget: "text",
            group: "Beziehung",
            placeholder: "z.B. owns_email, hosts_on, alias_of",
        }),
        confidence: ui(z.number().int().min(0).max(100).optional(), {
            label: "Konfidenz (0–100)",
            widget: "integer",
            group: "Beziehung",
        }),
        source: ui(z.string().max(64).optional(), {
            label: "Quelle",
            widget: "text",
            group: "Beziehung",
        }),
        data: ui(z.record(z.unknown()).optional(), {
            label: "Zusatzdaten",
            widget: "json",
            group: "Beziehung",
        }),
    })
    .strict();

export const entityTagBodySchema = z
    .object({
        tag: ui(z.string().min(1).max(64), { label: "Tag", widget: "text", group: "Tag" }),
        color: ui(z.string().max(16).nullable().optional(), {
            label: "Farbe",
            widget: "text",
            group: "Tag",
            placeholder: "z.B. #ff0000",
        }),
    })
    .strict();

export const entityEnrichFullBodySchema = z
    .object({
        engagementId: ui(z.number().int().positive(), {
            label: "Engagement",
            widget: "engagement-picker",
            group: "Enrichment",
        }),
    })
    .strict();

/**
 * PATCH /entities/:id — Operator-Edit der `entity.data` (Merge-Semantik:
 * existing data wird mit dem patch gemerged, nicht ersetzt). Optional
 * displayName-Update.
 */
export const entityPatchBodySchema = z.object({
    displayName: ui(z.string().min(1).max(256).optional(), {
        label: "Anzeigename",
        widget: "text",
        group: "Identität",
    }),
    data: ui(z.record(z.unknown()).optional(), {
        label: "Strukturierte Daten",
        widget: "json",
        group: "Identität",
        help: "Wird mit den existierenden data-Feldern gemerged (kein Replace).",
    }),
}).strict().refine((v) => v.displayName != null || v.data != null, {
    message: "At least one of displayName or data must be provided",
});

export type EntityCreateBody = z.infer<typeof entityCreateBodySchema>;
export type EntityListQuery = z.infer<typeof entityListQuerySchema>;
export type EntityRelationshipBody = z.infer<typeof entityRelationshipBodySchema>;
export type EntityTagBody = z.infer<typeof entityTagBodySchema>;
export type EntityEnrichFullBody = z.infer<typeof entityEnrichFullBodySchema>;
export type EntityPatchBody = z.infer<typeof entityPatchBodySchema>;

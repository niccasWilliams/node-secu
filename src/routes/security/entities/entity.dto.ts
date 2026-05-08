import { z } from "zod";

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
    // Phase 2.7 OSINT-Identity-Kinds
    "email_address",
    "username",
    "phone_number",
    "social_account",
]);

export const entityCreateBodySchema = z
    .object({
        kind: entityKind,
        primaryValue: z.string().min(1).max(512),
        displayName: z.string().min(1).max(256).optional(),
        discriminator: z.string().max(256).nullable().optional(),
        data: z.record(z.unknown()).optional(),
    })
    .strict();

export const entityListQuerySchema = z
    .object({
        kind: entityKind.optional(),
        q: z.string().max(256).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        // Sprint 1.2 (features.md §2.2) — default: false (speculative Entities ausgeblendet).
        includeSpeculative: z.coerce.boolean().optional(),
    })
    .strict();

export const entityParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const entityRelationshipBodySchema = z
    .object({
        toEntityId: z.number().int().positive(),
        kind: z.string().min(1).max(64),
        confidence: z.number().int().min(0).max(100).optional(),
        source: z.string().max(64).optional(),
        data: z.record(z.unknown()).optional(),
    })
    .strict();

export const entityTagBodySchema = z
    .object({
        tag: z.string().min(1).max(64),
        color: z.string().max(16).nullable().optional(),
    })
    .strict();

// Phase 2.7 — manueller Person/Email-Full-Enrichment-Trigger
export const entityEnrichFullBodySchema = z
    .object({
        engagementId: z.number().int().positive(),
    })
    .strict();

export type EntityCreateBody = z.infer<typeof entityCreateBodySchema>;
export type EntityListQuery = z.infer<typeof entityListQuerySchema>;
export type EntityRelationshipBody = z.infer<typeof entityRelationshipBodySchema>;
export type EntityTagBody = z.infer<typeof entityTagBodySchema>;
export type EntityEnrichFullBody = z.infer<typeof entityEnrichFullBodySchema>;

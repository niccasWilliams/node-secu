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

export type EntityCreateBody = z.infer<typeof entityCreateBodySchema>;
export type EntityListQuery = z.infer<typeof entityListQuerySchema>;
export type EntityRelationshipBody = z.infer<typeof entityRelationshipBodySchema>;
export type EntityTagBody = z.infer<typeof entityTagBodySchema>;

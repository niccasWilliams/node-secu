import { z } from "zod";

const engagementKind = z.enum(["solo_lab", "ctf", "bug_bounty", "customer_pentest", "internal"]);
const engagementStatus = z.enum(["planning", "active", "paused", "completed", "archived"]);
const entityRole = z.enum(["primary_target", "in_scope", "out_of_scope", "pivot", "context"]);
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
const authKind = z.enum(["own", "verified_ownership", "written_consent", "internal_lab"]);
const authScope = z.enum(["passive_only", "active_safe", "active_intrusive"]);
const authProofType = z.enum([
    "dns_txt",
    "http_file",
    "written_contract",
    "manual_owner_verification",
    "none",
]);

export const engagementCreateBodySchema = z
    .object({
        name: z.string().min(1).max(256),
        kind: engagementKind,
        status: engagementStatus.optional(),
        scopeSummary: z.string().max(8192).optional(),
        /** Convenience: Domain als primaryTarget direkt mit anlegen + verlinken + auth-record. */
        primaryDomain: z
            .string()
            .min(1)
            .max(256)
            .regex(/^[a-zA-Z0-9.-]+$/, "primaryDomain must be a bare hostname")
            .optional(),
    })
    .strict();

export const engagementUpdateBodySchema = z
    .object({
        name: z.string().min(1).max(256).optional(),
        status: engagementStatus.optional(),
        scopeSummary: z.string().max(8192).nullable().optional(),
    })
    .strict();

export const engagementListQuerySchema = z
    .object({
        includeArchived: z.coerce.boolean().optional(),
        kind: engagementKind.optional(),
        ownerUserId: z.coerce.number().int().positive().optional(),
    })
    .strict();

export const engagementParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const engagementEntityLinkBodySchema = z
    .object({
        // Entweder existierende entityId verlinken …
        entityId: z.number().int().positive().optional(),
        // … oder neue Entity in einem Rutsch upserten:
        upsert: z
            .object({
                kind: entityKind,
                primaryValue: z.string().min(1).max(512),
                displayName: z.string().min(1).max(256).optional(),
                discriminator: z.string().max(256).nullable().optional(),
                data: z.record(z.unknown()).optional(),
            })
            .optional(),
        role: entityRole.optional(),
        notes: z.string().max(4096).nullable().optional(),
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
        body: z.string().min(1).max(65536),
        title: z.string().max(256).optional(),
        entityId: z.number().int().positive().nullable().optional(),
    })
    .strict();

// Phase 2.7 — OSINT-Specific endpoints
export const osintEmailEntityBodySchema = z
    .object({
        email: z.string().email().max(320),
        personId: z.number().int().positive().nullable().optional(),
    })
    .strict();
export type OsintEmailEntityBody = z.infer<typeof osintEmailEntityBodySchema>;

export const grantAuthBodySchema = z
    .object({
        entityId: z.number().int().positive(),
        kind: authKind,
        scope: authScope,
        proofType: authProofType.optional(),
        proofRef: z.string().max(2048).nullable().optional(),
        verifiedAt: z.coerce.date().nullable().optional(),
        expiresAt: z.coerce.date().nullable().optional(),
        notes: z.string().max(4096).nullable().optional(),
    })
    .strict();

export type EngagementCreateBody = z.infer<typeof engagementCreateBodySchema>;
export type EngagementUpdateBody = z.infer<typeof engagementUpdateBodySchema>;
export type EngagementListQuery = z.infer<typeof engagementListQuerySchema>;
export type EngagementEntityLinkBody = z.infer<typeof engagementEntityLinkBodySchema>;
export type EngagementNoteBody = z.infer<typeof engagementNoteBodySchema>;
export type GrantAuthBody = z.infer<typeof grantAuthBodySchema>;

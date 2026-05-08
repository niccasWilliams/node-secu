import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import { entitySchema, entityRelationshipSchema } from "../security-response.dto";

export const neighborhoodParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const neighborhoodQuerySchema = z.object({
    depth: ui(z.coerce.number().int().min(1).max(2).optional(), {
        label: "Tiefe (Hops)",
        widget: "integer",
        group: "Graph",
        help: "Wie viele Schritte vom Start-Knoten? Default 1.",
    }),
    limit: ui(z.coerce.number().int().min(1).max(500).optional(), {
        label: "Max Knoten",
        widget: "integer",
        group: "Graph",
    }),
});

export const neighborhoodResponseSchema = z.object({
    center: entitySchema.nullable(),
    nodes: z.array(entitySchema),
    edges: z.array(entityRelationshipSchema),
}).strict();

export const crossEngagementHitsQuerySchema = z.object({
    kinds: ui(z.string().max(512).optional(), {
        label: "Entity-Kinds (CSV)",
        widget: "text",
        group: "Filter",
        placeholder: "person,email_address,asset_domain",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const crossEngagementHitItemSchema = z.object({
    entity: entitySchema,
    engagementIds: z.array(z.number().int()),
    engagementCount: z.number().int(),
}).strict();

export const crossEngagementHitsResponseSchema = z.object({
    items: z.array(crossEngagementHitItemSchema),
}).strict();

export const techGraphQuerySchema = z.object({
    minEngagements: ui(z.coerce.number().int().min(1).max(20).optional(), {
        label: "Mindestens-N-Engagements",
        widget: "integer",
        group: "Filter",
        help: "Nur Tech, die in mind. N aktiven Engagements gefunden wurde.",
    }),
    limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const techGraphItemSchema = z.object({
    techName: z.string(),
    engagementIds: z.array(z.number().int()),
    entityCount: z.number().int(),
}).strict();

export const techGraphResponseSchema = z.object({
    items: z.array(techGraphItemSchema),
}).strict();

export const techUsagesParamsSchema = z.object({
    techName: z.string().min(1).max(128),
});

export const techUsagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const techUsageItemSchema = z.object({
    entity: entitySchema,
    engagementIds: z.array(z.number().int()),
    tech: z.array(z.object({
        techName: z.string(),
        version: z.string().nullable().optional(),
        source: z.string().nullable().optional(),
        lastSeenAt: z.string().nullable().optional(),
    })),
}).strict();

export const techUsagesResponseSchema = z.object({
    items: z.array(techUsageItemSchema),
}).strict();

export type NeighborhoodQuery = z.infer<typeof neighborhoodQuerySchema>;
export type CrossEngagementHitsQuery = z.infer<typeof crossEngagementHitsQuerySchema>;
export type TechGraphQuery = z.infer<typeof techGraphQuerySchema>;
export type TechUsagesQuery = z.infer<typeof techUsagesQuerySchema>;

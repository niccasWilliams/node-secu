import { z } from "zod";

export const hintSlot = z.enum([
    "owner_name",
    "owner_city",
    "owner_company",
    "owner_known_email",
    "owner_known_username",
    "owner_alt_domain",
    "industry",
    "free_text",
]);

const hintItem = z
    .object({
        slot: hintSlot,
        value: z.string().min(1).max(1024),
        source: z.string().max(64).nullable().optional(),
        notes: z.string().max(2048).nullable().optional(),
    })
    .strict();

export const hintCreateBodySchema = z
    .object({
        items: z.array(hintItem).min(1).max(50),
    })
    .strict();

export const hintPatchBodySchema = z
    .object({
        value: z.string().min(1).max(1024).optional(),
        source: z.string().max(64).nullable().optional(),
        notes: z.string().max(2048).nullable().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, {
        message: "At least one of value/source/notes is required",
    });

export const engagementHintsParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const engagementHintByIdParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
    hintId: z.coerce.number().int().positive(),
});

export type HintCreateBody = z.infer<typeof hintCreateBodySchema>;
export type HintPatchBody = z.infer<typeof hintPatchBodySchema>;

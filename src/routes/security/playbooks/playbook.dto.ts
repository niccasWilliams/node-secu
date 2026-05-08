import { z } from "zod";

export const playbookKeyParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    playbookKey: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
});

export const playbookStartBodySchema = z
    .object({
        rootEntityId: z.number().int().positive(),
        params: z.record(z.unknown()).optional(),
        triggeredBy: z.string().max(128).optional(),
    })
    .strict();

export const playbookRunListParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const playbookRunGetParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    runId: z.coerce.number().int().positive(),
});

export type PlaybookStartBody = z.infer<typeof playbookStartBodySchema>;

import { z } from "zod";

export const workerListQuerySchema = z.object({
    targetKind: z.string().min(1).max(64).optional(),
    scope: z.enum(["passive_only", "active_safe", "active_intrusive"]).optional(),
});

export const workerRunStartParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    workerKey: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
});

export const workerRunStartBodySchema = z
    .object({
        entityId: z.number().int().positive(),
        timeoutMs: z.number().int().positive().max(3_600_000).optional(),
        triggeredBy: z.string().max(128).optional(),
    })
    .strict();

export const workerRunListParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const workerRunListQuerySchema = z.object({
    workerKey: z.string().min(1).max(64).optional(),
    status: z.enum(["pending", "running", "completed", "failed", "skipped"]).optional(),
    entityId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
});

export const workerRunGetParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    runId: z.coerce.number().int().positive(),
});

export type WorkerRunStartBody = z.infer<typeof workerRunStartBodySchema>;
export type WorkerListQuery = z.infer<typeof workerListQuerySchema>;
export type WorkerRunListQuery = z.infer<typeof workerRunListQuerySchema>;

import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import { paginatedQuery } from "@/api-contract/pagination.dto";

const workerScope = z.enum(["passive_only", "active_safe", "active_intrusive"]);
ui(workerScope, {
    label: "Erforderlicher Scope",
    widget: "select",
    group: "Filter",
    options: [
        { value: "passive_only", label: "Nur passiv", color: "neutral" },
        { value: "active_safe", label: "Aktiv – sicher", color: "warning" },
        { value: "active_intrusive", label: "Aktiv – intrusiv", color: "danger" },
    ],
});

export const workerListQuerySchema = z.object({
    targetKind: ui(z.string().min(1).max(64).optional(), {
        label: "Ziel-Typ",
        widget: "text",
        group: "Filter",
    }),
    scope: workerScope.optional(),
});

export const workerRunStartParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    workerKey: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
});

export const workerRunStartBodySchema = z
    .object({
        entityId: ui(z.number().int().positive(), {
            label: "Entity",
            widget: "entity-picker",
            group: "Ziel",
            order: 10,
        }),
        timeoutMs: ui(z.number().int().positive().max(3_600_000).optional(), {
            label: "Timeout (ms)",
            widget: "integer",
            group: "Ausführung",
            help: "Optionales Timeout in Millisekunden, max. 1 h.",
        }),
        triggeredBy: ui(z.string().max(128).optional(), {
            label: "Auslöser",
            widget: "hidden",
        }),
    })
    .strict();

export const workerRunListParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

const _workerRunStatusFilter = z
    .enum(["pending", "provisioning", "running", "completed", "failed", "cancelled", "skipped"])
    .optional();
ui(_workerRunStatusFilter, { label: "Status", widget: "select", group: "Filter" });

export const workerRunListQuerySchema = paginatedQuery({
    sortFields: ["createdAt", "startedAt", "finishedAt", "status", "durationMs"] as const,
    defaultSort: "createdAt",
    defaultOrder: "desc",
}).extend({
    workerKey: ui(z.string().min(1).max(64).optional(), {
        label: "Worker",
        widget: "worker-picker",
        group: "Filter",
    }),
    status: _workerRunStatusFilter,
    entityId: ui(z.coerce.number().int().positive().optional(), {
        label: "Entity",
        widget: "entity-picker",
        group: "Filter",
    }),
});

export const workerRunGetParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    runId: z.coerce.number().int().positive(),
});

export type WorkerRunStartBody = z.infer<typeof workerRunStartBodySchema>;
export type WorkerListQuery = z.infer<typeof workerListQuerySchema>;
export type WorkerRunListQuery = z.infer<typeof workerRunListQuerySchema>;

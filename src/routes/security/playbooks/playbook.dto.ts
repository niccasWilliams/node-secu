import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import { paginatedQuery } from "@/api-contract/pagination.dto";
import { playbookKeySchema } from "@/lib/security/playbooks/playbook-keys";

/**
 * Pfad-Param `:playbookKey` — typisiert auf das tatsächlich registrierte
 * Set aus playbook-keys.ts. Frontend bekommt einen exakten Union-String,
 * Drift wird beim Bootstrap erkannt.
 */
export const playbookKeyParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    playbookKey: playbookKeySchema,
});

export const playbookStartBodySchema = z
    .object({
        rootEntityId: ui(z.number().int().positive(), {
            label: "Root-Entity",
            widget: "entity-picker",
            group: "Ziel",
            help: "Auf welcher Entity startet das Playbook?",
        }),
        params: ui(z.record(z.unknown()).optional(), {
            label: "Parameter",
            widget: "json",
            group: "Erweitert",
            help: "Optionale Playbook-spezifische Parameter (JSON).",
        }),
        triggeredBy: ui(z.string().max(128).optional(), {
            label: "Auslöser",
            widget: "hidden",
        }),
    })
    .strict();

export const playbookRunListParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

/** Listet Runs eines Engagements mit Pagination + Filter. */
const _playbookRunStatusFilter = z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional();
ui(_playbookRunStatusFilter, { label: "Status", widget: "select", group: "Filter" });

const _playbookKeyFilter = playbookKeySchema.optional();
ui(_playbookKeyFilter, { label: "Playbook", widget: "playbook-picker", group: "Filter" });

export const playbookRunListQuerySchema = paginatedQuery({
    sortFields: ["createdAt", "startedAt", "finishedAt", "status"] as const,
    defaultSort: "createdAt",
    defaultOrder: "desc",
    maxLimit: 200,
}).extend({
    status: _playbookRunStatusFilter,
    playbookKey: _playbookKeyFilter,
});

export const playbookRunGetParamSchema = z.object({
    id: z.coerce.number().int().positive(),
    runId: z.coerce.number().int().positive(),
});

export type PlaybookStartBody = z.infer<typeof playbookStartBodySchema>;
export type PlaybookRunListQuery = z.infer<typeof playbookRunListQuerySchema>;

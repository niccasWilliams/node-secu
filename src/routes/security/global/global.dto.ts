// DTOs für die globalen, engagement-übergreifenden Endpoints
// (/graph/aggregate, /activity, /findings, /workers/runs).
//
// Alle Listen-Filter sind als CSV-Strings im Query-String entgegengenommen
// — angelehnt an den existierenden FE-Vorschlag — und werden im Controller
// in Arrays geparsed.

import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import {
    activityKindSchema,
    entityKindSchema,
    findingCategorySchema,
    findingStatusSchema,
    findingTriageReasonSchema,
    severitySchema,
    workerRunStatusSchema,
} from "../security-response.dto";

const csv = (max = 512) =>
    z
        .string()
        .max(max)
        .optional()
        .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined));

const isoDateTime = z
    .string()
    .datetime({ offset: true })
    .optional()
    .transform((v) => (v ? new Date(v) : undefined));

// ── Aggregate-Graph ───────────────────────────────────────────────────────

export const aggregateGraphQuerySchema = z.object({
    engagements: ui(csv(512), { label: "Engagements (CSV)", widget: "text", group: "Filter" }),
    dedupe: ui(z.enum(["canonicalKey", "none"]).optional(), { label: "Dedup-Strategie", widget: "select", group: "Graph" }),
    kinds: ui(csv(512), { label: "Entity-Kinds (CSV)", widget: "text", group: "Filter" }),
    severity: ui(csv(64), { label: "Severities (CSV)", widget: "text", group: "Filter" }),
    since: ui(isoDateTime, { label: "Seit (ISO)", widget: "datetime", group: "Filter" }),
    nodeLimit: z.coerce.number().int().min(1).max(2000).optional(),
});

// ── Activity-Feed ─────────────────────────────────────────────────────────

const activityCursorSchema = z
    .string()
    .max(256)
    .optional()
    .transform((v) => {
        if (!v) return undefined;
        try {
            const decoded = JSON.parse(Buffer.from(v, "base64").toString("utf-8"));
            if (decoded && typeof decoded === "object" && "at" in decoded && "id" in decoded) {
                const at = new Date(String(decoded.at));
                const id = Number(decoded.id);
                if (!Number.isNaN(at.getTime()) && Number.isFinite(id)) {
                    return { at, id };
                }
            }
        } catch {
            // ignore — invalid cursor → undefined (Server liefert fresh Page).
        }
        return undefined;
    });

export const activityQuerySchema = z.object({
    since: isoDateTime,
    until: isoDateTime,
    engagements: csv(512),
    kinds: csv(512), // worker_run, finding, signal_chain, engagement_status, playbook_run
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: activityCursorSchema,
});

// ── Cross-Findings ────────────────────────────────────────────────────────

const findingsCursorSchema = activityCursorSchema; // gleiches Format

export const findingsGlobalQuerySchema = z.object({
    engagements: csv(512),
    severity: csv(128),
    status: csv(256),
    category: csv(256),
    triageReason: csv(256),
    workerKey: csv(512),
    entityId: z.coerce.number().int().positive().optional(),
    discoveredSince: isoDateTime,
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: findingsCursorSchema,
});

// ── Cross-Worker-Runs ─────────────────────────────────────────────────────

const workerRunsCursorSchema = activityCursorSchema;

export const workerRunsGlobalQuerySchema = z.object({
    engagements: csv(512),
    status: csv(256),
    workerKey: csv(512),
    since: isoDateTime,
    limit: z.coerce.number().int().min(1).max(200).optional(),
    cursor: workerRunsCursorSchema,
});

// ── Entity-Detail-Extended (Gap 5) — optionaler Engagement-Kontext ────────

export const entityDetailExtendedQuerySchema = z.object({
    engagementContext: z.coerce.number().int().positive().optional(),
    findingsLimit: z.coerce.number().int().min(1).max(500).optional(),
    workerRunsLimit: z.coerce.number().int().min(1).max(200).optional(),
    relatedLimit: z.coerce.number().int().min(1).max(500).optional(),
});

// Hilfsfunktion: number-CSV-Parser (für engagementIds)
export function parseNumericCsv(values: string[] | undefined): number[] | undefined {
    if (!values) return undefined;
    const nums = values
        .map((v) => Number.parseInt(v, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    return nums.length > 0 ? nums : undefined;
}

// Hilfsfunktion: cursor zu base64 schreiben
export function encodeCursor(cur: { at: Date; id: number } | null): string | null {
    if (!cur) return null;
    return Buffer.from(JSON.stringify({ at: cur.at.toISOString(), id: cur.id }), "utf-8").toString("base64");
}

// Type-Re-Exports — für Callsites/Frontend, die die Filter-Schemas typed nutzen wollen.
export type AggregateGraphQuery = z.infer<typeof aggregateGraphQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type FindingsGlobalQuery = z.infer<typeof findingsGlobalQuerySchema>;
export type WorkerRunsGlobalQuery = z.infer<typeof workerRunsGlobalQuerySchema>;
export type EntityDetailExtendedQuery = z.infer<typeof entityDetailExtendedQuerySchema>;

// Validierung: erlaubte Severity / Status / Kind als runtime-Whitelist
export const allowedSeverities = severitySchema.options;
export const allowedFindingStatus = findingStatusSchema.options;
export const allowedFindingCategory = findingCategorySchema.options;
export const allowedFindingTriageReason = findingTriageReasonSchema.options;
export const allowedEntityKinds = entityKindSchema.options;
export const allowedActivityKinds = activityKindSchema.options;
export const allowedWorkerRunStatus = workerRunStatusSchema.options;

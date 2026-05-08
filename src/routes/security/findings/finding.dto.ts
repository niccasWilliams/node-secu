import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import { paginatedQuery } from "@/api-contract/pagination.dto";
import {
    findingCategorySchema,
    findingStatusSchema,
    findingTriageReasonSchema,
    severitySchema,
} from "../security-response.dto";

ui(severitySchema, {
    label: "Schweregrad",
    widget: "select",
    group: "Filter",
    options: [
        { value: "critical", label: "Kritisch", color: "danger" },
        { value: "high", label: "Hoch", color: "danger" },
        { value: "medium", label: "Mittel", color: "warning" },
        { value: "low", label: "Niedrig", color: "info" },
        { value: "info", label: "Info", color: "neutral" },
    ],
});

ui(findingStatusSchema, {
    label: "Status",
    widget: "select",
    group: "Triage",
    options: [
        { value: "open", label: "Offen", color: "warning" },
        { value: "triaged", label: "Triagiert", color: "info" },
        { value: "confirmed", label: "Bestätigt", color: "danger" },
        { value: "false_positive", label: "False-Positive", color: "neutral" },
        { value: "wont_fix", label: "Won't Fix", color: "neutral" },
        { value: "fixed", label: "Behoben", color: "success" },
    ],
});

ui(findingTriageReasonSchema, {
    label: "Triage-Grund",
    widget: "select",
    group: "Triage",
    help: "Warum dieser Status?",
    options: [
        { value: "irrelevant_legacy", label: "Irrelevant (Legacy)", color: "neutral" },
        { value: "compensating_control", label: "Kompensierende Maßnahme", color: "info" },
        { value: "accepted_risk", label: "Akzeptiertes Risiko", color: "warning" },
        { value: "duplicate", label: "Duplikat", color: "neutral" },
        { value: "manual_review_pending", label: "Manuelle Prüfung läuft", color: "info" },
        { value: "customer_approved", label: "Kunden-OK", color: "success" },
        { value: "scoping_excluded", label: "Außerhalb Scope", color: "neutral" },
        { value: "other", label: "Sonstige", color: "neutral" },
    ],
});

ui(findingCategorySchema, { label: "Kategorie", widget: "select", group: "Filter" });

export const findingListParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const findingByIdParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
    findingId: z.coerce.number().int().positive(),
});

export const findingCommentByIdParamsSchema = z.object({
    id: z.coerce.number().int().positive(),
    findingId: z.coerce.number().int().positive(),
    commentId: z.coerce.number().int().positive(),
});

export const findingListQuerySchema = paginatedQuery({
    sortFields: ["discoveredAt", "severity", "status", "category"] as const,
    defaultSort: "discoveredAt",
    defaultOrder: "desc",
    maxLimit: 1000,
}).extend({
    severity: severitySchema.optional(),
    status: findingStatusSchema.optional(),
    triageReason: findingTriageReasonSchema.optional(),
    category: findingCategorySchema.optional(),
    workerKey: ui(z.string().min(1).max(64).optional(), {
        label: "Worker",
        widget: "worker-picker",
        group: "Filter",
    }),
    entityId: ui(z.coerce.number().int().positive().optional(), {
        label: "Entity",
        widget: "entity-picker",
        group: "Filter",
    }),
});

/**
 * Triage-Patch: Status ändern, optional Begründung + freie Notiz + Resolution-Note
 * (letztere füllt sich nur bei End-Status fixed/wont_fix/false_positive für's Reporting).
 */
export const findingPatchBodySchema = z
    .object({
        status: findingStatusSchema,
        triageReason: ui(findingTriageReasonSchema.nullable().optional(), {
            label: "Begründung",
            widget: "select",
            group: "Triage",
        }),
        triageNote: ui(z.string().max(8192).nullable().optional(), {
            label: "Triage-Notiz",
            widget: "textarea",
            group: "Triage",
            help: "Kurze Erklärung zum aktuellen Status.",
        }),
        resolutionNote: ui(z.string().max(8192).nullable().optional(), {
            label: "Resolution-Note",
            widget: "textarea",
            group: "Resolution",
            help: "Wie wurde das behoben? (Geht ins Reporting.)",
        }),
    })
    .strict();

export const findingCommentBodySchema = z
    .object({
        body: ui(z.string().min(1).max(16384), {
            label: "Kommentar",
            widget: "textarea",
            group: "Kommentar",
            placeholder: "Notiz, Kontext, Verweis…",
        }),
    })
    .strict();

export type FindingListQuery = z.infer<typeof findingListQuerySchema>;
export type FindingPatchBody = z.infer<typeof findingPatchBodySchema>;
export type FindingCommentBody = z.infer<typeof findingCommentBodySchema>;

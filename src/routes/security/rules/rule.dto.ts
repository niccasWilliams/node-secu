import { z } from "zod";
import { ui } from "@/api-contract/ui-meta";
import { paginatedQuery } from "@/api-contract/pagination.dto";

export const ruleTriggerSchema = z.enum([
    "entity.created",
    "entity.updated",
    "finding.created",
    "playbook_run.completed",
    "schedule",
]);
ui(ruleTriggerSchema, {
    label: "Trigger",
    widget: "select",
    group: "Auslöser",
    help: "Welches Event soll die Regel feuern?",
    options: [
        { value: "entity.created", label: "Neue Entity erkannt", color: "info" },
        { value: "entity.updated", label: "Entity aktualisiert", color: "info" },
        { value: "finding.created", label: "Neues Finding", color: "warning" },
        { value: "playbook_run.completed", label: "Playbook abgeschlossen", color: "success" },
        { value: "schedule", label: "Zeitgesteuert (Cron)", color: "neutral" },
    ],
});

export const ruleActionSchema = z.enum([
    "start_playbook",
    "tag_entity",
    "notify_boss",
    "create_finding",
]);
ui(ruleActionSchema, {
    label: "Aktion",
    widget: "select",
    group: "Reaktion",
    options: [
        { value: "start_playbook", label: "Playbook starten", color: "info" },
        { value: "tag_entity", label: "Entity taggen", color: "neutral" },
        { value: "notify_boss", label: "Boss-Notification", color: "warning" },
        { value: "create_finding", label: "Finding anlegen", color: "danger" },
    ],
});

export const ruleScopeSchema = z
    .string()
    .max(64)
    .regex(/^(global|engagement_kind:[a-z_]+|engagement:\d+)$/, {
        message: "scope must be 'global', 'engagement_kind:<kind>', or 'engagement:<id>'",
    });
ui(ruleScopeSchema, {
    label: "Geltungsbereich",
    widget: "text",
    group: "Allgemein",
    placeholder: "global / engagement_kind:customer_pentest / engagement:42",
    help: "global · engagement_kind:<kind> · engagement:<id>",
});

export const ruleCreateBodySchema = z
    .object({
        name: ui(z.string().min(1).max(128), { label: "Name", widget: "text", group: "Allgemein", order: 10 }),
        description: ui(z.string().max(2000).nullable().optional(), {
            label: "Beschreibung",
            widget: "textarea",
            group: "Allgemein",
        }),
        scope: ruleScopeSchema.default("global"),
        trigger: ruleTriggerSchema,
        action: ruleActionSchema,
        condition: ui(z.record(z.unknown()).nullable().optional(), {
            label: "Bedingung (json-logic)",
            widget: "json",
            group: "Auslöser",
            help: "Optionaler json-logic Ausdruck — Rule feuert nur wenn das Ergebnis truthy ist.",
        }),
        actionParams: ui(z.record(z.unknown()).default({}), {
            label: "Aktions-Parameter",
            widget: "json",
            group: "Reaktion",
            help: "z.B. {\"playbookKey\":\"osint_email_passive\"} oder {\"tag\":\"interesting\"}",
        }),
        enabled: ui(z.boolean().default(true), { label: "Aktiv", widget: "checkbox", group: "Allgemein" }),
    })
    .strict();

export const ruleUpdateBodySchema = z
    .object({
        name: ui(z.string().min(1).max(128).optional(), { label: "Name", widget: "text", group: "Allgemein" }),
        description: ui(z.string().max(2000).nullable().optional(), {
            label: "Beschreibung",
            widget: "textarea",
            group: "Allgemein",
        }),
        scope: ruleScopeSchema.optional(),
        trigger: ruleTriggerSchema.optional(),
        action: ruleActionSchema.optional(),
        condition: ui(z.record(z.unknown()).nullable().optional(), {
            label: "Bedingung",
            widget: "json",
            group: "Auslöser",
        }),
        actionParams: ui(z.record(z.unknown()).optional(), {
            label: "Aktions-Parameter",
            widget: "json",
            group: "Reaktion",
        }),
        enabled: ui(z.boolean().optional(), { label: "Aktiv", widget: "checkbox", group: "Allgemein" }),
    })
    .strict();

const _ruleEnabledFilter = z.enum(["true", "false"]).optional();
ui(_ruleEnabledFilter, { label: "Aktiv-Filter", widget: "select", group: "Filter" });

export const ruleListQuerySchema = paginatedQuery({
    sortFields: ["createdAt", "updatedAt", "name", "fireCount", "lastFiredAt"] as const,
    defaultSort: "createdAt",
    defaultOrder: "desc",
}).extend({
    trigger: ruleTriggerSchema.optional(),
    enabled: _ruleEnabledFilter,
    scope: ruleScopeSchema.optional(),
});

export const ruleParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export type RuleCreateBody = z.infer<typeof ruleCreateBodySchema>;
export type RuleUpdateBody = z.infer<typeof ruleUpdateBodySchema>;
export type RuleListQuery = z.infer<typeof ruleListQuerySchema>;

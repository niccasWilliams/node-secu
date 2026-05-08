import { z } from "zod";

export const ruleTriggerSchema = z.enum([
    "entity.created",
    "entity.updated",
    "finding.created",
    "playbook_run.completed",
    "schedule",
]);

export const ruleActionSchema = z.enum([
    "start_playbook",
    "tag_entity",
    "notify_boss",
    "create_finding",
]);

export const ruleScopeSchema = z
    .string()
    .max(64)
    .regex(/^(global|engagement_kind:[a-z_]+|engagement:\d+)$/, {
        message: "scope must be 'global', 'engagement_kind:<kind>', or 'engagement:<id>'",
    });

export const ruleCreateBodySchema = z
    .object({
        name: z.string().min(1).max(128),
        description: z.string().max(2000).nullable().optional(),
        scope: ruleScopeSchema.default("global"),
        trigger: ruleTriggerSchema,
        action: ruleActionSchema,
        condition: z.record(z.unknown()).nullable().optional(),
        actionParams: z.record(z.unknown()).default({}),
        enabled: z.boolean().default(true),
    })
    .strict();

export const ruleUpdateBodySchema = z
    .object({
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(2000).nullable().optional(),
        scope: ruleScopeSchema.optional(),
        trigger: ruleTriggerSchema.optional(),
        action: ruleActionSchema.optional(),
        condition: z.record(z.unknown()).nullable().optional(),
        actionParams: z.record(z.unknown()).optional(),
        enabled: z.boolean().optional(),
    })
    .strict();

export const ruleListQuerySchema = z
    .object({
        trigger: ruleTriggerSchema.optional(),
        enabled: z.enum(["true", "false"]).optional(),
        scope: ruleScopeSchema.optional(),
    })
    .strict();

export const ruleParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export type RuleCreateBody = z.infer<typeof ruleCreateBodySchema>;
export type RuleUpdateBody = z.infer<typeof ruleUpdateBodySchema>;
export type RuleListQuery = z.infer<typeof ruleListQuerySchema>;

import { z } from "zod";

export const catalogEnumOptionSchema = z.object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    label: z.string(),
    description: z.string().optional(),
    color: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
    icon: z.string().optional(),
}).strict();

export const catalogEnumSchema = z.object({
    key: z.string(),
    label: z.string(),
    values: z.array(z.string()),
    options: z.array(catalogEnumOptionSchema),
}).strict();

export const catalogEnumsResponseSchema = z.object({
    enums: z.record(catalogEnumSchema),
}).strict();

export const catalogPlaybookSchema = z.object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    category: z.string(),
    danger: z.enum(["passive", "active_safe", "active_intrusive"]),
    expectedRuntimeSec: z.number().int().nullable(),
    requiredScope: z.enum(["passive_only", "active_safe", "active_intrusive"]),
    acceptsRootEntityKinds: z.array(z.string()),
    stepCount: z.number().int(),
}).strict();

export const catalogPlaybooksResponseSchema = z.object({
    items: z.array(catalogPlaybookSchema),
}).strict();

export const catalogWorkerSchema = z.object({
    jobKey: z.string(),
    label: z.string(),
    description: z.string(),
    category: z.string(),
    requiredScope: z.enum(["passive_only", "active_safe", "active_intrusive"]),
    defaultTimeoutMs: z.number().int(),
    targetKinds: z.array(z.string()),
}).strict();

export const catalogWorkersResponseSchema = z.object({
    items: z.array(catalogWorkerSchema),
}).strict();

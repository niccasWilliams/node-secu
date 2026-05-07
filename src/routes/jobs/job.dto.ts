import { z } from "zod";
import { zQueryBoolean } from "@/api-contract/zod-helpers";

export const jobWorkerSchema = z.enum([
  "core-maintenance-worker",
  "finance-compliance-worker",
  "admin-reporting-worker",
]);

export const jobDomainSchema = z.enum(["maintenance", "compliance", "reporting"]);

export const jobsListQuerySchema = z
  .object({
    worker: jobWorkerSchema.optional(),
    domain: jobDomainSchema.optional(),
    activeOnly: zQueryBoolean().optional(),
  })
  .strict();

export const jobMetaSchema = z
  .object({
    runId: z.string().min(1).max(128).optional(),
    triggeredBy: z.string().min(1).max(128).optional(),
    requestedAt: z.string().datetime().optional(),
  })
  .catchall(z.unknown());

const callbackInfoSchema = z.object({
  url: z.string().url(),
  runId: z.string().min(1),
  expectedSignatureHeader: z.string().optional(),
});

export const jobExecuteBodySchema = z
  .object({
    jobId: z.string().min(1),
    schedule: z.string().optional(),
    payload: z.unknown().optional(),
    meta: jobMetaSchema.optional(),
    _callback: callbackInfoSchema.optional(),
  })
  .strict();

export const jobCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  schedule: z.string(),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  domain: jobDomainSchema,
  worker: jobWorkerSchema,
  runOrder: z.number().int().nonnegative(),
  allowConcurrentRuns: z.boolean(),
});

export const jobsListRawResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(jobCatalogEntrySchema),
  count: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export const jobWorkerCatalogEntrySchema = z.object({
  worker: jobWorkerSchema,
  domain: jobDomainSchema,
  name: z.string(),
  description: z.string(),
  jobs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      schedule: z.string(),
      urgency: z.enum(["low", "medium", "high", "critical"]),
      runOrder: z.number().int().nonnegative(),
      active: z.boolean(),
    })
  ),
});

export const jobWorkersListRawResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(jobWorkerCatalogEntrySchema),
  count: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export const runningJobEntrySchema = z.object({
  executionKey: z.string(),
  jobId: z.string(),
  runId: z.string().nullable(),
  triggeredBy: z.string().nullable(),
  requestedAt: z.string().nullable(),
  startedAt: z.string().datetime(),
  worker: jobWorkerSchema,
  domain: jobDomainSchema,
});

export const jobsRunningRawResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(runningJobEntrySchema),
  count: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export const jobOverviewRawResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    totalJobs: z.number().int().nonnegative(),
    activeJobs: z.number().int().nonnegative(),
    inactiveJobs: z.number().int().nonnegative(),
    workers: z.array(
      z.object({
        worker: jobWorkerSchema,
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        inactive: z.number().int().nonnegative(),
      })
    ),
    domains: z.array(
      z.object({
        domain: jobDomainSchema,
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        inactive: z.number().int().nonnegative(),
      })
    ),
    urgencies: z.array(
      z.object({
        urgency: z.enum(["low", "medium", "high", "critical"]),
        total: z.number().int().nonnegative(),
      })
    ),
  }),
  generatedAt: z.string().datetime(),
});

export const jobExecuteRawResponseSchema = z.object({
  success: z.boolean(),
  jobId: z.string(),
  durationMs: z.number().int().nonnegative(),
  executedAt: z.string().datetime(),
  result: z.unknown().nullable(),
});

export const jobErrorRawResponseSchema = z
  .object({
    error: z.string(),
    details: z.unknown().optional(),
    jobId: z.string().optional(),
  })
  .strict();

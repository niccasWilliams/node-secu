import { z } from "zod";

const workflowIdSchema = z.string().regex(/^WF_\d+_[a-f0-9]{8}$/);

export const workflowIdParamSchema = z.object({
  workflowId: workflowIdSchema,
});

export const listWorkflowsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    resultsPerPage: z.coerce.number().int().min(1).max(500).optional(),
    status: z
      .union([
        z.enum(["pending", "processing", "completed", "failed", "canceled"]),
        z.array(z.enum(["pending", "processing", "completed", "failed", "canceled"])),
      ])
      .optional(),
    workflowType: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]).optional(),
    userId: z.coerce.number().int().positive().optional(),
    createdAfter: z.coerce.date().optional(),
    createdBefore: z.coerce.date().optional(),
    search: z.string().trim().min(1).optional(),
    sortBy: z.enum(["createdAt", "updatedAt", "priority", "status"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  })
  .strict();

export const deleteWorkflowsBodySchema = z
  .object({
    workflowIds: z.array(workflowIdSchema).min(1),
  })
  .strict();

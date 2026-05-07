import { z } from "zod";

export const userActivityUsersQuerySchema = z.object({}).strict();

export const userActivityUserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const userActivityOverviewBodySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    resultsPerPage: z.coerce.number().int().min(1).max(500).optional(),
    statusCodes: z.array(z.coerce.number().int().min(100).max(599)).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z.coerce.number().int().min(1).max(3650).optional(),
  })
  .strict();

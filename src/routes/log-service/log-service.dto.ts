import { z } from "zod";

export const logSearchQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(10).max(500).optional(),
    level: z.enum(["debug", "info", "warn", "error"]).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  })
  .strict();

export const logIdParamSchema = z.object({
  logId: z.coerce.number().int().positive(),
});

export const logIdsParamSchema = z.object({
  logIds: z
    .string()
    .min(1)
    .regex(/^\d+(,\d+)*$/, "logIds must be a comma-separated list of numeric IDs"),
});

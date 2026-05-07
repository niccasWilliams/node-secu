import { z } from "zod";

export const webhooksListQuerySchema = z.object({}).strict();

export const webhookIdParamSchema = z.object({
  webhookId: z.coerce.number().int().positive(),
});

export const webhookIdsParamSchema = z.object({
  webhookIds: z
    .string()
    .min(1)
    .regex(/^\d+(,\d+)*$/, "webhookIds must be a comma-separated list of numeric IDs"),
});

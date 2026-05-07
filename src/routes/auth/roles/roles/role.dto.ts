import { z } from "zod";

export const roleIdParamSchema = z.object({
  roleId: z.coerce.number().int().positive(),
});

export const roleCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().min(1).max(512),
    isSellable: z.coerce.boolean().optional(),
  })
  .strict();

export const roleUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().min(1).max(512),
  })
  .strict();

export const rolesListQuerySchema = z.object({}).strict();

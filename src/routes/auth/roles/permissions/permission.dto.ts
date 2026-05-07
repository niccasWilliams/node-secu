import { z } from "zod";

export const permissionCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    description: z.string().trim().min(1).max(512),
  })
  .strict();

export const permissionRoleAssignmentParamsSchema = z.object({
  roleId: z.coerce.number().int().positive(),
  permissionId: z.coerce.number().int().positive(),
});

export const permissionsListQuerySchema = z.object({}).strict();

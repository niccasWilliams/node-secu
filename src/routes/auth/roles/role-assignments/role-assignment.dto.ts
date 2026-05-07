import { z } from "zod";

export const roleAssignmentUserRoleParamsSchema = z.object({
  userId: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
});

export const roleAssignmentUserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const roleAssignmentCreateBodySchema = z
  .object({
    validFrom: z.string().datetime().optional(),
  })
  .strict();

export const roleAssignmentListQuerySchema = z.object({}).strict();

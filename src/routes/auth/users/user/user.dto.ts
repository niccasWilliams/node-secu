import { z } from "zod";

export const createUserBodySchema = z
  .object({
    externalUserId: z.coerce.string().trim().min(1),
    email: z.string().email().max(320).optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const frontendUserIdParamSchema = z.object({
  frontendUserId: z.coerce.number().int().positive(),
});

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const externalUserIdParamSchema = z.object({
  externalUserId: z.coerce.number().int().positive(),
});

export const userEmailParamSchema = z.object({
  email: z.string().trim().min(3).max(320),
});

export const updateUserBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((value) => value.firstName !== undefined || value.lastName !== undefined, {
    message: "At least one field (firstName or lastName) must be provided",
  });

export const searchUsersQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export const emptyQuerySchema = z.object({}).strict();

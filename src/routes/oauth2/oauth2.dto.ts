import { z } from "zod";

export const oauth2EmptyQuerySchema = z.object({}).strict();

export const oauth2TokenBodySchema = z
  .object({
    grant_type: z.enum(["client_credentials", "refresh_token"]),
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    scope: z.string().optional(),
    refresh_token: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.grant_type === "refresh_token" && !v.refresh_token) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refresh_token"],
        message: "refresh_token is required for grant_type=refresh_token",
      });
    }
  });

export const oauth2TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string().optional(),
});

export const oauth2ErrorResponseSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export const oauth2RevokeBodySchema = z.object({
  token: z.string().min(1),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  token_type_hint: z.enum(["refresh_token", "access_token"]).optional(),
});

export const oauth2RevokeResponseSchema = z.object({
  status: z.literal("ok"),
});

export const oauth2ClientIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const oauth2ClientsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const oauth2ClientAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const oauth2ClientCreateBodySchema = z.object({
  name: z.string().min(1),
  description: z.preprocess((v) => (v === null ? undefined : v), z.string().optional()),
  role: z.enum(["viewer", "editor", "admin"]),
  scopes: z.array(z.string()).optional(),
  // Tenant resource fields (only used when OAUTH2_TENANT_CONFIG.enabled = true)
  defaultCostCenter: z.preprocess(
    (v) => (v === null || v === "" ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  availableCostCenters: z.array(z.coerce.number().int().positive()).optional(),
  accessTokenTtl: z.coerce.number().int().min(60).optional(),
  refreshTokenTtl: z.coerce.number().int().min(60).optional(),
  allowedIps: z.array(z.string()).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(0).optional(),
  rateLimitPerHour: z.coerce.number().int().min(0).optional(),
  validTo: z.string().datetime().optional(),
});

export const oauth2ClientUpdateBodySchema = oauth2ClientCreateBodySchema.partial();

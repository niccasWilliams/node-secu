
import z from "zod";


export const entitlementEmptyQuerySchema = z.object({}).strict();

export const entitlementIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const assignedEntitlementsQuerySchema = z.object({
    userId: z.string().min(1).optional(),
});

export const userIdParamSchema = z.object({
    userId: z.string().min(1),
});

export const entitlementTypeSchema = z.enum(["role", "area"]);

export const assignEntitlementBodySchema = z.object({
    externalUserId: z.string().min(1),
    externalIdentifier: z.string().min(1),
    entitlementType: entitlementTypeSchema,
    validFrom: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
    expiresAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
    // Phase 2: limits and credits pushed by shop on assignment
    limits: z.record(z.object({
        included: z.number(),
        behavior: z.string(),
        payAsYouGoActive: z.boolean(),
        maxOverageQuantity: z.number().nullable().optional(),
        overagePricePerUnit: z.number().nullable().optional(),
    })).optional(),
    credits: z.record(z.object({
        remaining: z.number(),
        type: z.string(),
        pools: z.array(z.object({
            poolId: z.number(),
            creditType: z.string(),
            totalCredits: z.number(),
            usedCredits: z.number(),
            remaining: z.number(),
            expiresAt: z.string().nullable(),
        })).optional(),
    })).optional(),
}).passthrough(); // Tolerates unknown fields from shop — prevents integration breakage when shop adds new fields before node-bill is updated

export const creditUpdateWebhookBodySchema = z.object({
    type: z.literal("credit_updated"),
    reason: z.string(),
    customerId: z.number(),
    metricKey: z.string(),
    pools: z.array(z.object({
        poolId: z.number(),
        creditType: z.string(),
        totalCredits: z.number(),
        usedCredits: z.number(),
        remaining: z.number(),
        expiresAt: z.string().nullable(),
    })),
    totalRemaining: z.number(),
    timestamp: z.string(),
});

export const usageAlertWebhookBodySchema = z.object({
    alertType: z.enum(["approaching_limit", "limit_reached", "in_overage"]),
    customerId: z.number(),
    metricKey: z.string(),
    thresholdPercent: z.number(),
    currentUsagePercent: z.number(),
    includedQuantity: z.number(),
    usedQuantity: z.number(),
}).passthrough();

export const entitlementStateParamsSchema = z.object({
    userId: z.string().min(1),
    type: entitlementTypeSchema,
    identifier: z.string().min(1),
});

export const entitlementUpdateBodySchema = z.object({
    validFrom: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
    expiresAt: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
}).strict();

export const entitlementShopAssignmentParamSchema = z.object({
    shopAssignmentId: z.string().min(1),
});

export const usageOveragesPullQuerySchema = z.object({
    since: z.string().datetime({ offset: true }).optional(),
    periodStart: z.string().datetime({ offset: true }).optional(),
    periodEnd: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(5000).optional(),
}).strict();

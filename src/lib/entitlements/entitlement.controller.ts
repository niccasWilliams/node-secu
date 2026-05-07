/**
 * Entitlement Controller
 *
 * Handles incoming entitlement requests from external apps.
 * Maps shop roles to "entitlements" for external consumption.
 * Access is guarded by dedicated entitlement-sync auth middleware.
 */

import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { validatedBody, validatedParams, validatedQuery } from "@/api-contract/validated";
import {
    assignEntitlementBodySchema,
    entitlementIdParamSchema,
    assignedEntitlementsQuerySchema,
    userIdParamSchema,
    entitlementStateParamsSchema,
    entitlementUpdateBodySchema,
    entitlementShopAssignmentParamSchema,
    usageOveragesPullQuerySchema,
} from "./entitlement.dto";
import { EntitlementNotFoundError, EntitlementValidationError, entitlementUseCase } from "./entitlement.useCase";
import { entitlementSyncContextService, ShopEntitlementSyncContext } from "./entitlement-sync-context.service";
import { usageOveragePullService } from "./usage-overage-pull.service";
import { shopCreditSyncService } from "./shop-credit-sync.service";
import { creditUpdateWebhookBodySchema, usageAlertWebhookBodySchema } from "./entitlement.dto";
import { APP_METRICS } from "./individual/entitlement-metrics.config";


class EntitlementController {
    private parseNullableDate(value: string | null | undefined, fieldName: string): Date | null | undefined {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            throw new EntitlementValidationError(`Invalid ${fieldName} (expected ISO datetime)`);
        }
        return parsed;
    }

    private getHeader(req: Request, name: string): string | undefined {
        const value = req.headers[name.toLowerCase()];
        if (typeof value === "string") {
            const v = value.trim();
            return v.length > 0 ? v : undefined;
        }
        if (Array.isArray(value) && value.length > 0) {
            const v = String(value[0] ?? "").trim();
            return v.length > 0 ? v : undefined;
        }
        return undefined;
    }

    private getShopContext(req: Request): ShopEntitlementSyncContext {
        return {
            shopSyncVersion: this.getHeader(req, "x-shop-sync-version"),
            shopAssignmentId: this.getHeader(req, "x-shop-assignment-id"),
            shopEntitlementId: this.getHeader(req, "x-shop-entitlement-id"),
            shopCustomerId: this.getHeader(req, "x-shop-customer-id"),
            shopOrderId: this.getHeader(req, "x-shop-order-id"),
            shopOrderItemId: this.getHeader(req, "x-shop-order-item-id"),
            sourceAppId: this.getHeader(req, "x-app-id"),
            sourceTargetAppId: this.getHeader(req, "x-target-app-id"),
        };
    }

    private getSourceClientId(req: Request): string | undefined {
        const authClientId = (req as any)?.entitlementSyncAuth?.oauthClientId;
        if (typeof authClientId === "string" && authClientId.trim().length > 0) {
            return authClientId.trim();
        }
        return this.getHeader(req, "x-app-id");
    }

    /**
     * POST /entitlements
     * Assign a sellable entitlement to a user (idempotent).
     */
    async assignEntitlement(req: Request, res: Response) {
        try {
            const body = validatedBody(req, assignEntitlementBodySchema);
            if (!body) return res.status(400).json({ message: "Invalid body" });

            const validFrom = this.parseNullableDate(body.validFrom, "validFrom");
            const expiresAt = this.parseNullableDate(body.expiresAt, "expiresAt");

            const result = await entitlementUseCase.assignEntitlement({
                externalUserId: body.externalUserId,
                externalIdentifier: body.externalIdentifier,
                entitlementType: body.entitlementType,
                validFrom,
                expiresAt,
                sourceClientId: this.getSourceClientId(req),
                shopContext: this.getShopContext(req),
            });

            // Phase 2: Store limits and credits from shop in local DB
            if (body.limits) {
                await shopCreditSyncService.upsertLimits(body.externalUserId, body.limits).catch((err) => {
                    console.error("[assignEntitlement] Failed to store limits:", err);
                });
            }
            if (body.credits) {
                for (const [metricKey, credit] of Object.entries(body.credits)) {
                    await shopCreditSyncService.upsertCreditBalance(
                        body.externalUserId,
                        metricKey,
                        credit.remaining,
                        credit.pools ?? []
                    ).catch((err) => {
                        console.error("[assignEntitlement] Failed to store credits:", err);
                    });
                }
            }

            return res.status(result.created ? 201 : 200).json(result);
        } catch (error: any) {
            console.error("Error in assignEntitlement:", error);
            if (error instanceof EntitlementNotFoundError) {
                return res.status(404).json({ message: error.message });
            }
            if (error instanceof EntitlementValidationError) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: error.message || "Failed to assign entitlement" });
        }
    }

    /**
     * GET /entitlements/:userId/:type/:identifier
     * Returns current entitlement state for a user.
     */
    async getEntitlementState(req: Request, res: Response) {
        try {
            const params = validatedParams(req, entitlementStateParamsSchema);
            if (!params) return res.status(400).json({ message: "Missing or invalid path parameters" });

            const state = await entitlementUseCase.getEntitlementState({
                externalUserId: params.userId,
                entitlementType: params.type,
                externalIdentifier: params.identifier,
                sourceClientId: this.getSourceClientId(req),
                shopContext: this.getShopContext(req),
            });

            if (!state) return res.status(404).json({ message: "Entitlement assignment not found" });
            return res.status(200).json(state);
        } catch (error: any) {
            console.error("Error in getEntitlementState:", error);
            if (error instanceof EntitlementNotFoundError) {
                return res.status(404).json({ message: error.message });
            }
            if (error instanceof EntitlementValidationError) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: error.message || "Failed to fetch entitlement state" });
        }
    }

    /**
     * PUT /entitlements/:userId/:type/:identifier
     * Updates entitlement validity for a user (upsert behavior).
     */
    async updateEntitlement(req: Request, res: Response) {
        try {
            const params = validatedParams(req, entitlementStateParamsSchema);
            if (!params) return res.status(400).json({ message: "Missing or invalid path parameters" });

            const body = validatedBody(req, entitlementUpdateBodySchema);
            if (!body) return res.status(400).json({ message: "Invalid body" });

            const validFrom = this.parseNullableDate(body.validFrom, "validFrom");
            const expiresAt = this.parseNullableDate(body.expiresAt, "expiresAt");

            const result = await entitlementUseCase.updateEntitlement({
                externalUserId: params.userId,
                entitlementType: params.type,
                externalIdentifier: params.identifier,
                validFrom,
                expiresAt,
                sourceClientId: this.getSourceClientId(req),
                shopContext: this.getShopContext(req),
            });

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error in updateEntitlement:", error);
            if (error instanceof EntitlementNotFoundError) {
                return res.status(404).json({ message: error.message });
            }
            if (error instanceof EntitlementValidationError) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: error.message || "Failed to update entitlement" });
        }
    }

    /**
     * DELETE /entitlements/:userId/:type/:identifier
     * Revokes entitlement access for a user (idempotent).
     */
    async revokeEntitlement(req: Request, res: Response) {
        try {
            const params = validatedParams(req, entitlementStateParamsSchema);
            if (!params) return res.status(400).json({ message: "Missing or invalid path parameters" });

            const result = await entitlementUseCase.revokeEntitlement({
                externalUserId: params.userId,
                entitlementType: params.type,
                externalIdentifier: params.identifier,
                sourceClientId: this.getSourceClientId(req),
                shopContext: this.getShopContext(req),
            });

            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error in revokeEntitlement:", error);
            if (error instanceof EntitlementNotFoundError) {
                return res.status(404).json({ message: error.message });
            }
            if (error instanceof EntitlementValidationError) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: error.message || "Failed to revoke entitlement" });
        }
    }

    /**
     * GET /entitlements/getAll
     * Returns all sellable roles as entitlements.
     */
    async getEntitlements(req: Request, res: Response) {
        try {
            const result = await entitlementUseCase.getEntitlements();
            return res.status(200).json(result);
        } catch (error: any) {
            console.error("Error in getEntitlements:", error);
            return res.status(500).json({ message: error.message || "Failed to fetch entitlements" });
        }
    }

    /**
     * GET /entitlements/:id
     * Returns a single sellable role/entitlement with its permissions.
     */
    async getEntitlementById(req: Request, res: Response) {
        try {
            const params = validatedParams(req, entitlementIdParamSchema);
            if (!params) return responseHandler(res, 400, "Missing or invalid id parameter");

            const result = await entitlementUseCase.getEntitlementDetail(params.id);
            return responseHandler(res, 200, "Entitlement fetched successfully", result);
        } catch (error: any) {
            console.error("Error in getEntitlementById:", error);
            if (error instanceof EntitlementNotFoundError || error.message?.includes("not found")) {
                return responseHandler(res, 404, error.message);
            }
            return responseHandler(res, 500, error.message || "Failed to fetch entitlement");
        }
    }

    /**
     * GET /entitlements/assigned
     * Returns active role assignments for sellable roles only.
     * Optional query userId is treated as externalUserId.
     */
    async getAssignedEntitlements(req: Request, res: Response) {
        try {
            const query = validatedQuery(req, assignedEntitlementsQuerySchema) ?? undefined;
            const result = await entitlementUseCase.getAssignedEntitlements(query);
            return responseHandler(res, 200, "Assigned entitlements fetched successfully", result);
        } catch (error: any) {
            console.error("Error in getAssignedEntitlements:", error);
            return responseHandler(res, 500, error.message || "Failed to fetch assigned entitlements");
        }
    }

    /**
     * GET /entitlements/user/:userId
     * userId is treated as externalUserId.
     * Ensures local user exists and returns active sellable roles for that user.
     */
    async getUserEntitlements(req: Request, res: Response) {
        try {
            const params = validatedParams(req, userIdParamSchema);
            if (!params) return responseHandler(res, 400, "Missing or invalid userId parameter");

            const result = await entitlementUseCase.getUserEntitlements(params.userId);
            return responseHandler(res, 200, "User entitlements fetched successfully", result);
        } catch (error: any) {
            console.error("Error in getUserEntitlements:", error);
            return responseHandler(res, 500, error.message || "Failed to fetch user entitlements");
        }
    }

    /**
     * GET /entitlements/context/by-shop-assignment/:shopAssignmentId
     * Debug/Support endpoint: resolve persisted entitlement-sync context by shop assignment id.
     */
    async getSyncContextByShopAssignment(req: Request, res: Response) {
        try {
            const params = validatedParams(req, entitlementShopAssignmentParamSchema);
            if (!params) return responseHandler(res, 400, "Missing or invalid shopAssignmentId parameter");

            const row = await entitlementSyncContextService.getByShopAssignmentId(params.shopAssignmentId);
            if (!row) return responseHandler(res, 404, "Entitlement sync context not found");
            return responseHandler(res, 200, "Entitlement sync context retrieved", row);
        } catch (error: any) {
            console.error("Error in getSyncContextByShopAssignment:", error);
            return responseHandler(res, 500, error.message || "Failed to fetch entitlement sync context");
        }
    }

    /**
     * GET /entitlements/usage-overages
     * Pull endpoint for shop usage/overage synchronization.
     */
    async getUsageOverages(req: Request, res: Response) {
        try {
            const query = validatedQuery(req, usageOveragesPullQuerySchema) ?? {};

            const parseDate = (value: string | undefined, fieldName: string): Date | undefined => {
                if (!value) return undefined;
                const parsed = new Date(value);
                if (Number.isNaN(parsed.getTime())) {
                    throw new EntitlementValidationError(`Invalid ${fieldName} (expected ISO datetime)`);
                }
                return parsed;
            };

            const periodStart = parseDate(query.periodStart, "periodStart");
            const periodEnd = parseDate(query.periodEnd, "periodEnd");
            const since = parseDate(query.since, "since");

            if (periodStart && periodEnd && periodStart.getTime() > periodEnd.getTime()) {
                throw new EntitlementValidationError("periodStart must be <= periodEnd");
            }

            const rows = await usageOveragePullService.getUsageOverageEvents({
                since,
                periodStart,
                periodEnd,
                limit: query.limit,
            });

            return res.status(200).json(rows);
        } catch (error: any) {
            console.error("Error in getUsageOverages:", error);
            if (error instanceof EntitlementValidationError) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: error.message || "Failed to fetch usage overages" });
        }
    }
    /**
     * POST /webhooks/usage-alerts
     * Receives usage limit alerts from the shop.
     * Resolves the actual app user and sends them a notification email.
     */
    async handleUsageAlertWebhook(req: Request, res: Response) {
        try {
            const body = validatedBody(req, usageAlertWebhookBodySchema);
            if (!body) return res.status(400).json({ message: "Invalid webhook body" });

            const { userService } = await import("@/routes/auth/users/user/user.service");
            const { emailService } = await import("@/util/email.service");
            const { entitlementSyncLinks } = await import("@/db/schema");
            const { database } = await import("@/db");
            const { eq } = await import("drizzle-orm");

            // Resolve shop customerId → node-bill userId via entitlementSyncLinks
            const [link] = await database
                .select({ externalUserId: entitlementSyncLinks.externalUserId })
                .from(entitlementSyncLinks)
                .where(eq(entitlementSyncLinks.shopCustomerId, String(body.customerId)))
                .limit(1);

            if (!link) {
                console.warn(`[usageAlertWebhook] No user link for shop customerId ${body.customerId}`);
                return res.status(200).json({ received: true, notified: false, reason: "user_not_linked" });
            }

            // Get the actual node-bill user
            const userId = Number(link.externalUserId);
            if (!userId) {
                return res.status(200).json({ received: true, notified: false, reason: "invalid_user_id" });
            }

            const user = await userService.getUserById(userId);
            if (!user?.email) {
                console.warn(`[usageAlertWebhook] User ${userId} has no email`);
                return res.status(200).json({ received: true, notified: false, reason: "no_email" });
            }

            // Build and send alert email
            const isOverLimit = body.currentUsagePercent >= 100;
            // Metric labels from individual config — falls back to raw key
            const metricLabelMap = new Map(
                APP_METRICS.map((m) => [m.key, m.alertLabel ?? m.description ?? m.key])
            );
            const metricLabel = metricLabelMap.get(body.metricKey) ?? body.metricKey;

            const subject = isOverLimit
                ? `Nutzungslimit erreicht: ${metricLabel}`
                : `Nutzungslimit-Warnung: ${metricLabel} bei ${Math.round(body.currentUsagePercent)}%`;

            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: ${isOverLimit ? '#dc2626' : '#f59e0b'}">
                        ${isOverLimit ? 'Nutzungslimit erreicht' : 'Nutzungslimit-Warnung'}
                    </h2>
                    <p>Hallo ${user.firstName ?? user.email},</p>
                    <p>Ihr Kontingent fuer <strong>${metricLabel}</strong> hat
                       <strong>${Math.round(body.currentUsagePercent)}%</strong> erreicht.</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                        <tr style="background: #f3f4f6;">
                            <td style="padding: 8px; border: 1px solid #e5e7eb;">Metrik</td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb;"><strong>${metricLabel}</strong></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border: 1px solid #e5e7eb;">Verbraucht</td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb;">
                                <strong>${body.usedQuantity}</strong> / ${body.includedQuantity}
                            </td>
                        </tr>
                        <tr style="background: #f3f4f6;">
                            <td style="padding: 8px; border: 1px solid #e5e7eb;">Auslastung</td>
                            <td style="padding: 8px; border: 1px solid #e5e7eb; color: ${isOverLimit ? '#dc2626' : '#f59e0b'};">
                                <strong>${Math.round(body.currentUsagePercent)}%</strong>
                            </td>
                        </tr>
                    </table>
                    ${isOverLimit
                        ? '<p>Sie haben Ihr inkludiertes Kontingent ueberschritten. Je nach Tarif koennen zusaetzliche Kosten anfallen.</p>'
                        : '<p>Bitte ueberpruefen Sie Ihre Nutzung rechtzeitig, um Unterbrechungen zu vermeiden.</p>'
                    }
                </div>
            `;

            await emailService.sendEmail(user.email, subject, html);

            return res.status(200).json({ received: true, notified: true, userId });
        } catch (error: any) {
            console.error("[handleUsageAlertWebhook] Error:", error);
            return res.status(200).json({ received: true, notified: false, reason: "error", message: error.message });
        }
    }

    /**
     * POST /webhooks/credit-update
     * Receives credit balance updates from the shop.
     */
    async handleCreditUpdateWebhook(req: Request, res: Response) {
        try {
            const body = validatedBody(req, creditUpdateWebhookBodySchema);
            if (!body) return res.status(400).json({ message: "Invalid webhook body" });

            await shopCreditSyncService.handleCreditUpdateWebhook(body);

            return res.status(200).json({ received: true });
        } catch (error: any) {
            console.error("[handleCreditUpdateWebhook] Error:", error);
            return res.status(500).json({ message: error.message || "Failed to process credit update" });
        }
    }
}

export const entitlementController = new EntitlementController();

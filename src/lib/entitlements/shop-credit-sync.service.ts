import { database } from "@/db";
import {
    shopLimitConfigs,
    shopCreditBalances,
    creditConsumptionQueue,
    ShopLimitConfig,
    ShopCreditBalance,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logService } from "@/routes/log-service/log-service.service";

type LimitInfo = {
    included: number;
    behavior: string;
    payAsYouGoActive: boolean;
    maxOverageQuantity?: number | null;
    overagePricePerUnit?: number | null;
};

type CreditPoolInfo = {
    poolId: number;
    creditType: string;
    totalCredits: number;
    usedCredits: number;
    remaining: number;
    expiresAt: string | null;
};

type CreditUpdateEvent = {
    type: "credit_updated";
    reason: string;
    customerId: number;
    metricKey: string;
    pools: CreditPoolInfo[];
    totalRemaining: number;
    timestamp: string;
};

class ShopCreditSyncService {
    /**
     * Stores limits received from shop (via entitlement assignment webhook).
     * Upserts by (externalUserId, metricKey).
     */
    async upsertLimits(
        externalUserId: string,
        limits: Record<string, LimitInfo>
    ): Promise<void> {
        const now = new Date();

        for (const [metricKey, limit] of Object.entries(limits)) {
            const existing = await database
                .select()
                .from(shopLimitConfigs)
                .where(
                    and(
                        eq(shopLimitConfigs.externalUserId, externalUserId),
                        eq(shopLimitConfigs.metricKey, metricKey)
                    )
                )
                .limit(1);

            if (existing.length > 0) {
                await database
                    .update(shopLimitConfigs)
                    .set({
                        includedQuantity: String(limit.included),
                        limitBehavior: limit.behavior,
                        payAsYouGoActive: limit.payAsYouGoActive,
                        maxOverageQuantity: limit.maxOverageQuantity != null ? String(limit.maxOverageQuantity) : null,
                        overagePricePerUnit: limit.overagePricePerUnit != null ? String(limit.overagePricePerUnit) : null,
                        lastSyncedAt: now,
                        updatedAt: now,
                    })
                    .where(eq(shopLimitConfigs.id, existing[0].id));
            } else {
                await database.insert(shopLimitConfigs).values({
                    externalUserId,
                    metricKey,
                    includedQuantity: String(limit.included),
                    limitBehavior: limit.behavior,
                    payAsYouGoActive: limit.payAsYouGoActive,
                    maxOverageQuantity: limit.maxOverageQuantity != null ? String(limit.maxOverageQuantity) : null,
                    overagePricePerUnit: limit.overagePricePerUnit != null ? String(limit.overagePricePerUnit) : null,
                    lastSyncedAt: now,
                    createdAt: now,
                });
            }
        }
    }

    /**
     * Stores credit balance received from shop (via credit-update webhook or entitlement assignment).
     * Upserts by (externalUserId, metricKey). Resets localUsed when shop pushes new state.
     */
    async upsertCreditBalance(
        externalUserId: string,
        metricKey: string,
        totalRemaining: number,
        pools: CreditPoolInfo[]
    ): Promise<void> {
        const now = new Date();

        const existing = await database
            .select()
            .from(shopCreditBalances)
            .where(
                and(
                    eq(shopCreditBalances.externalUserId, externalUserId),
                    eq(shopCreditBalances.metricKey, metricKey)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            await database
                .update(shopCreditBalances)
                .set({
                    totalRemaining: String(totalRemaining),
                    localUsed: "0", // Reset: shop is now the source of truth
                    lastShopSync: now,
                    pools: pools,
                    updatedAt: now,
                })
                .where(eq(shopCreditBalances.id, existing[0].id));
        } else {
            await database.insert(shopCreditBalances).values({
                externalUserId,
                metricKey,
                totalRemaining: String(totalRemaining),
                localUsed: "0",
                lastShopSync: now,
                pools: pools,
                createdAt: now,
            });
        }
    }

    /**
     * Handles a credit-update webhook from the shop.
     * Maps shop customerId to externalUserId via entitlementSyncLinks.
     */
    async handleCreditUpdateWebhook(event: CreditUpdateEvent, externalUserId?: string): Promise<void> {
        if (!externalUserId) {
            // Try to resolve from entitlement sync links
            const { entitlementSyncLinks } = await import("@/db/schema");
            const links = await database
                .select({ externalUserId: entitlementSyncLinks.externalUserId })
                .from(entitlementSyncLinks)
                .where(eq(entitlementSyncLinks.shopCustomerId, String(event.customerId)))
                .limit(1);

            externalUserId = links[0]?.externalUserId;
        }

        if (!externalUserId) {
            await logService.warn("[ShopCreditSync] Cannot resolve externalUserId for credit update", {
                customerId: event.customerId,
                metricKey: event.metricKey,
            });
            return;
        }

        await this.upsertCreditBalance(
            externalUserId,
            event.metricKey,
            event.totalRemaining,
            event.pools
        );
    }

    /**
     * Locally consumes credits. Returns true if sufficient, false if not.
     * Queues a sync event for the shop.
     */
    async consumeLocally(
        externalUserId: string,
        metricKey: string,
        amount: number,
        idempotencyKey: string
    ): Promise<{ success: boolean; localRemaining: number }> {
        const balance = await database
            .select()
            .from(shopCreditBalances)
            .where(
                and(
                    eq(shopCreditBalances.externalUserId, externalUserId),
                    eq(shopCreditBalances.metricKey, metricKey)
                )
            )
            .limit(1);

        if (balance.length === 0) {
            // No credit balance known — allow (graceful degradation)
            return { success: true, localRemaining: -1 };
        }

        const entry = balance[0];
        const available = Number(entry.totalRemaining) - Number(entry.localUsed);

        if (available < amount) {
            // Check limit behavior
            const limitConfig = await database
                .select()
                .from(shopLimitConfigs)
                .where(
                    and(
                        eq(shopLimitConfigs.externalUserId, externalUserId),
                        eq(shopLimitConfigs.metricKey, metricKey)
                    )
                )
                .limit(1);

            const behavior = limitConfig[0]?.limitBehavior ?? "soft_warn";
            if (behavior === "hard_block") {
                return { success: false, localRemaining: available };
            }
            // soft_warn or pay_as_you_go: allow but still track
        }

        // Deduct locally
        await database
            .update(shopCreditBalances)
            .set({
                localUsed: sql`${shopCreditBalances.localUsed}::numeric + ${String(amount)}::numeric`,
                updatedAt: new Date(),
            })
            .where(eq(shopCreditBalances.id, entry.id));

        // Queue sync to shop
        await database.insert(creditConsumptionQueue).values({
            externalUserId,
            metricKey,
            amount: String(amount),
            idempotencyKey,
            status: "pending",
            createdAt: new Date(),
        }).onConflictDoNothing(); // idempotencyKey unique

        return { success: true, localRemaining: available - amount };
    }

    /**
     * Get local effective balance for a user+metric.
     */
    async getEffectiveBalance(externalUserId: string, metricKey: string): Promise<number | null> {
        const [balance] = await database
            .select()
            .from(shopCreditBalances)
            .where(
                and(
                    eq(shopCreditBalances.externalUserId, externalUserId),
                    eq(shopCreditBalances.metricKey, metricKey)
                )
            )
            .limit(1);

        if (!balance) return null;
        return Number(balance.totalRemaining) - Number(balance.localUsed);
    }

    /**
     * Get local limit config for a user+metric.
     */
    async getLimit(externalUserId: string, metricKey: string): Promise<ShopLimitConfig | null> {
        const [config] = await database
            .select()
            .from(shopLimitConfigs)
            .where(
                and(
                    eq(shopLimitConfigs.externalUserId, externalUserId),
                    eq(shopLimitConfigs.metricKey, metricKey)
                )
            )
            .limit(1);
        return config ?? null;
    }

    /**
     * Get all pending consumption queue entries (for sync job).
     */
    async getPendingConsumptions(limit = 100) {
        return database
            .select()
            .from(creditConsumptionQueue)
            .where(eq(creditConsumptionQueue.status, "pending"))
            .orderBy(creditConsumptionQueue.createdAt)
            .limit(limit);
    }

    /**
     * Mark a consumption as synced after successful shop confirmation.
     */
    async markConsumptionSynced(id: number, shopResponse: unknown): Promise<void> {
        await database
            .update(creditConsumptionQueue)
            .set({ status: "synced", shopResponse, lastAttemptAt: new Date() })
            .where(eq(creditConsumptionQueue.id, id));
    }

    /**
     * Mark a consumption attempt as failed (will retry).
     */
    async markConsumptionFailed(id: number, attempts: number): Promise<void> {
        await database
            .update(creditConsumptionQueue)
            .set({
                attempts,
                lastAttemptAt: new Date(),
                status: attempts >= 10 ? "failed" : "pending",
            })
            .where(eq(creditConsumptionQueue.id, id));
    }
}

export const shopCreditSyncService = new ShopCreditSyncService();

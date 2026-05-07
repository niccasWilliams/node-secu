/**
 * Sync Credit Consumption Job
 *
 * Sends queued local credit consumption events to the shop's POST /credits/consume endpoint.
 * Idempotent via idempotencyKey — safe to retry.
 *
 * Required env vars:
 * - SHOP_API_URL: e.g. "https://shop.example.com/credits/consume"
 * - SHOP_API_KEY: API key for x-api-key auth to the shop
 */

import axios from "axios";
import { shopCreditSyncService } from "./shop-credit-sync.service";
import { logService } from "@/routes/log-service/log-service.service";

export async function syncCreditConsumptionJob(): Promise<{
    synced: number;
    failed: number;
    skipped: number;
}> {
    const shopUrl = (process.env.SHOP_API_URL ?? "").trim();
    const shopApiKey = (process.env.SHOP_API_KEY ?? "").trim();

    if (!shopUrl || !shopApiKey) {
        return { synced: 0, failed: 0, skipped: 0 };
    }

    const pending = await shopCreditSyncService.getPendingConsumptions(50);
    if (pending.length === 0) {
        return { synced: 0, failed: 0, skipped: 0 };
    }

    let synced = 0;
    let failed = 0;

    for (const entry of pending) {
        try {
            const response = await axios.post(
                shopUrl,
                {
                    externalUserId: entry.externalUserId,
                    metricKey: entry.metricKey,
                    amount: Number(entry.amount),
                    idempotencyKey: entry.idempotencyKey,
                },
                {
                    headers: { "x-api-key": shopApiKey },
                    timeout: 10000,
                    validateStatus: (status) => status >= 200 && status < 500,
                }
            );

            if (response.status >= 200 && response.status < 300) {
                await shopCreditSyncService.markConsumptionSynced(entry.id, response.data);

                // Update local balance from shop's authoritative response
                if (response.data?.data?.remainingTotal !== undefined) {
                    await shopCreditSyncService.upsertCreditBalance(
                        entry.externalUserId,
                        entry.metricKey,
                        response.data.data.remainingTotal,
                        response.data.data.pools ?? []
                    );
                }

                synced++;
            } else if (response.status === 402) {
                // Insufficient credits on shop side — mark as synced (shop knows about it)
                await shopCreditSyncService.markConsumptionSynced(entry.id, response.data);
                synced++;
            } else {
                await shopCreditSyncService.markConsumptionFailed(entry.id, entry.attempts + 1);
                failed++;
            }
        } catch (error) {
            await shopCreditSyncService.markConsumptionFailed(entry.id, entry.attempts + 1);
            failed++;

            await logService.warn("[syncCreditConsumptionJob] Failed to sync consumption", {
                entryId: entry.id,
                externalUserId: entry.externalUserId,
                metricKey: entry.metricKey,
                attempts: entry.attempts + 1,
                error: error instanceof Error ? error.message : error,
            });
        }
    }

    return { synced, failed, skipped: 0 };
}

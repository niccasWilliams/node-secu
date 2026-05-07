import { DateTime } from "luxon";
import { eq, and, inArray, or, sql, ilike, desc, asc, count } from "drizzle-orm";
import { database } from "@/db";
import { User, users, Webhook, WebhookId, webhooks, WebhookStatus } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { WebhookPayload } from "./webhook.useCase";



export type WebhookFilters = {
    provider?: string;
    eventType?: string;
    status?: WebhookStatus;
    processed?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
    externalId?: string;
}

export type WebhookStats = {
    total: number;
    processed: number;
    failed: number;
    pending: number;
    skipped: number;
    todayCount: number;
    avgProcessingTime?: number;
}

export type PaginationOptions = {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'processedAt' | 'status';
    sortOrder?: 'asc' | 'desc';
}



export class WebhookService {
    private db;
    private readonly MAX_RETRIES = 3;
    private readonly DUPLICATE_WINDOW_MINUTES = 5;

    constructor() {
        this.db = database;
    }

    /**
        * Erstellt einen neuen Webhook
        */
    async createWebhook(
        externalId: string,
        provider: string,
        eventType: string,
        payload: WebhookPayload,
        trx = database
    ): Promise<WebhookId> {
        try {
            const [webhook] = await trx.insert(webhooks).values({
                provider: provider,
                payload: payload.payload,
                originUrl: payload.originUrl,
                userAgent: payload.userAgent,
                signature: payload.signature,
                eventType: eventType,
                externalId: externalId,
                createdAt: nowInBerlin(),
                retryCount: 0,
            }).returning({ id: webhooks.id });

            console.log(`Webhook created: ${provider}:${eventType}:${externalId} (ID: ${webhook.id})`);
            return webhook.id;
        } catch (error) {
            console.error("Error creating webhook:", error);
            throw new Error(`Error creating webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Erstellt einen Stripe Webhook
     */
    async createStripeWebhook(externalId: string, eventType: string, payload: WebhookPayload): Promise<WebhookId> {
        try {
            return await this.createWebhook(externalId, "stripe", eventType, payload);
        } catch (error) {
            console.error("Error creating Stripe webhook:", error);
            throw new Error(`Error creating Stripe webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Erstellt einen PayPal Webhook
     */
    async createPaypalWebhook(externalId: string, eventType: string, payload: WebhookPayload): Promise<WebhookId> {
        try {
            return await this.createWebhook(externalId, "paypal", eventType, payload);
        } catch (error) {
            console.error("Error creating PayPal webhook:", error);
            throw new Error(`Error creating PayPal webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Markiert einen Webhook als verarbeitet
     */
    async markWebhookAsProcessed(webhookId: WebhookId, processMessage?: string): Promise<void> {
        try {
            await this.db.update(webhooks)
                .set({
                    processed: true,
                    processMessage: processMessage,
                    status: "processed",
                    processedAt: nowInBerlin(),
                })
                .where(eq(webhooks.id, webhookId));
        } catch (error) {
            console.error("Error marking webhook as processed:", error);
            throw new Error("Error marking webhook as processed");
        }
    }





    /**
     * Markiert einen Webhook als fehlgeschlagen
     */
    async markWebhookAsFailed(webhookId: WebhookId, processMessage?: string): Promise<void> {
        try {
            await this.db.update(webhooks)
                .set({
                    processed: true,
                    processMessage: processMessage,
                    status: "failed",
                    processedAt: nowInBerlin(),
                })
                .where(eq(webhooks.id, webhookId));
        } catch (error) {
            console.error("Error marking webhook as failed:", error);
            throw new Error("Error marking webhook as failed");
        }
    }

    /**
     * Markiert einen Webhook als übersprungen
     */
    async markWebhookAsSkipped(webhookId: WebhookId, processMessage?: string): Promise<void> {
        try {
            await this.db.update(webhooks)
                .set({
                    processed: true,
                    processMessage: processMessage,
                    status: "skipped",
                    processedAt: nowInBerlin(),
                })
                .where(eq(webhooks.id, webhookId));
        } catch (error) {
            console.error("Error marking webhook as skipped:", error);
            throw new Error("Error marking webhook as skipped");
        }
    }

    /**
     * Erhöht den Retry-Counter eines Webhooks
     */
    async incrementRetryCount(webhookId: WebhookId): Promise<void> {
        try {
            await this.db.update(webhooks)
                .set({
                    retryCount: sql`${webhooks.retryCount} + 1`,
                    lastRetryAt: nowInBerlin(),
                })
                .where(eq(webhooks.id, webhookId));
        } catch (error) {
            console.error("Error incrementing retry count:", error);
            throw new Error("Error incrementing retry count");
        }
    }

    /**
     * Holt einen Webhook anhand seiner ID
     */
    async getWebhookById(webhookId: WebhookId) {
        try {
            return await this.db.query.webhooks.findFirst({
                where: eq(webhooks.id, webhookId)
            });
        } catch (error) {
            console.error("Error getting webhook by ID:", error);
            throw new Error("Error getting webhook by ID");
        }
    }

   async getWebhooks() {
       try {
           return await this.db.query.webhooks.findMany();
       } catch (error) {
           console.error("Error getting webhooks:", error);
           throw new Error("Error getting webhooks");
       }
   }

    /**
     * Holt Webhook-Statistiken
     */
    async getWebhookStats(provider?: string): Promise<WebhookStats> {
        try {
            const today = DateTime.now().startOf('day').toJSDate();
            const whereProvider = provider ? eq(webhooks.provider, provider) : undefined;

            const [stats, todayStats] = await Promise.all([
                this.db.select({
                    total: count(),
                    processed: sql<number>`COUNT(CASE WHEN ${webhooks.processed} = true THEN 1 END)`,
                    failed: sql<number>`COUNT(CASE WHEN ${webhooks.status} = 'failed' THEN 1 END)`,
                    pending: sql<number>`COUNT(CASE WHEN ${webhooks.status} = 'pending' THEN 1 END)`,
                    skipped: sql<number>`COUNT(CASE WHEN ${webhooks.status} = 'skipped' THEN 1 END)`,
                }).from(webhooks).where(whereProvider),

                this.db.select({
                    count: count()
                }).from(webhooks).where(and(
                    sql`${webhooks.createdAt} >= ${today}`,
                    whereProvider
                ))
            ]);

            return {
                total: stats[0].total,
                processed: Number(stats[0].processed),
                failed: Number(stats[0].failed),
                pending: Number(stats[0].pending),
                skipped: Number(stats[0].skipped),
                todayCount: todayStats[0].count,
            };
        } catch (error) {
            console.error("Error getting webhook stats:", error);
            throw new Error("Error getting webhook stats");
        }
    }

    /**
        * Sucht nach existierenden Webhooks (inkl. failed/pending)
        */
    async findExistingWebhook(externalId: string, provider: string, eventType: string): Promise<Webhook[] | null> {
        try {
            const result = await this.db.select().from(webhooks).where(
                and(
                    eq(webhooks.externalId, externalId),
                    eq(webhooks.provider, provider),
                    eq(webhooks.eventType, eventType),
                )
            ).limit(1);
            return result ?? null;
        } catch (error) {
            console.error("Error finding existing webhook:", error);
            return null;
        }
    }


    async deleteWebhook(webhookId: WebhookId): Promise<void> {
        try {
            await this.db.delete(webhooks).where(eq(webhooks.id, webhookId));

        } catch (error) {
            console.error("Error deleting webhook:", error);
            throw new Error("Error deleting webhook");
        }
    }

    async deleteWebhooks(webhookIds: WebhookId[]): Promise<void> {
        if (!webhookIds || webhookIds.length === 0) return;

        try {
            await this.db.delete(webhooks).where(inArray(webhooks.id, webhookIds));
        } catch (error) {
            console.error("Error deleting webhooks:", error);
            throw new Error("Error deleting webhooks");
        }
    }   

}

export const webhookService = new WebhookService();
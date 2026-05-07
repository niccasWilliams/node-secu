
import { User, users, WebhookId, webhooks, WebhookStatus, Webhook } from "@/db/schema";
import { webhookService } from "./webhook.service";
import { TrackedWebhook } from "./webhook.tracker";



export type WebhookPayload = {
    payload: Record<string, any>;
    originUrl?: string;
    userAgent?: string;
    signature?: string;
};

export type IncomingWebhook = {
    externalId: string;
    provider: string;
    eventType: string;
    payload: WebhookPayload;
};

export type WebhookTrackingResult = {
    webhookId: WebhookId | null;
    status: 'tracked' | 'duplicate' | 'error';
    message?: string;
};

export class WebhookUseCase {
    async trackIncomingWebhook(webhook: IncomingWebhook): Promise<TrackedWebhook | null> {
        try {
            const existing = await webhookService.findExistingWebhook(
                webhook.externalId,
                webhook.provider,
                webhook.eventType
            );

            if (existing?.length) {
                return new TrackedWebhook(
                    existing[0].id,
                    webhook.provider,
                    webhook.eventType,
                    webhook.externalId
                );
            }

            const webhookId = await webhookService.createWebhook(
                webhook.externalId,
                webhook.provider,
                webhook.eventType,
                webhook.payload
            );

            return new TrackedWebhook(webhookId, webhook.provider, webhook.eventType, webhook.externalId);
        } catch (error) {
            console.error("❌ Error tracking webhook:", error);
            return null;
        }
    }

   //webhook trackers are in ./individual-webhooks.ts (bc of node template)
}

export const webhookUseCase = new WebhookUseCase();

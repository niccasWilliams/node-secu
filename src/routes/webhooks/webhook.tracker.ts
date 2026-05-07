import { WebhookId } from "@/db/schema";
import { webhookService } from "./webhook.service";

export class TrackedWebhook {
  constructor(
    public readonly id: WebhookId,
    public readonly provider: string,
    public readonly eventType: string,
    public readonly externalId: string
  ) {}

  async markAsProcessed(message?: string): Promise<void> {
    await webhookService.markWebhookAsProcessed(this.id, message ?? "Processed successfully");
  }

  async markAsFailed(message?: string): Promise<void> {
    await webhookService.markWebhookAsFailed(this.id, message ?? "Processing failed");
  }


}
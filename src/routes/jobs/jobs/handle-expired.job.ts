import { database } from "@/db";
import { appLogs, webhooks, workflowQueue } from "@/db/schema";

import { logService } from "@/routes/log-service/log-service.service";
import { lt } from "drizzle-orm";


const APP_LOG_RETENTION_DAYS = 60;
const WORKFLOW_RETENTION_DAYS = 30;
const WEBHOOK_RETENTION_DAYS = 30;
const INVOICE_QUOTE_TTL_HOURS = 24;

function cutoff(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function handleExpiredJob() {
    try {
        // 1. App logs older than 60 days
        const logCutoff = cutoff(APP_LOG_RETENTION_DAYS);
        const deletedLogs = await database
            .delete(appLogs)
            .where(lt(appLogs.createdAt, logCutoff))
            .returning({ id: appLogs.id });

      



            if (deletedLogs.length > 0) {

                await logService.info("handle-expired: cleanup completed", {
                    job: "handle-expired",
                    deletedLogs: deletedLogs.length,
                });
            } 
    } catch (error) {
        await logService.error("Cleanup job failed", {
            job: "handle-expired",
            message: (error as any)?.message,
            error: (error as any)?.stack,
        });
        throw error;
    }
}

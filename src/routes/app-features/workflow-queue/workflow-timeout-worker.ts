import { database } from "@/db";
import { workflowQueue } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { workflowQueueService } from "./workflow-queue.service";

/**
 * Workflow Timeout Worker
 *
 * Periodically checks for workflows that have exceeded their timeout
 * and executes cleanup for them.
 */
class WorkflowTimeoutWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs = 60000; // Check every 60 seconds

  /**
   * Start the timeout worker
   *
   * @param intervalMs - Check interval in milliseconds (default: 60000)
   */
  start(intervalMs: number = this.checkIntervalMs): void {
    if (this.isRunning) {
      console.warn("[TimeoutWorker] Already running");
      return;
    }

    this.checkIntervalMs = intervalMs;
    this.isRunning = true;

    console.log(
      `[TimeoutWorker] Starting timeout worker (check interval: ${intervalMs}ms)`
    );

    // Run immediately on start
    this.checkTimeouts();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkTimeouts();
    }, intervalMs);
  }

  /**
   * Stop the timeout worker
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn("[TimeoutWorker] Not running");
      return;
    }

    console.log("[TimeoutWorker] Stopping timeout worker");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Check for timed out workflows and cleanup
   */
  private async checkTimeouts(): Promise<void> {
    try {
      const now = new Date();

      // Find workflows that are processing and have exceeded timeout
      const timedOutWorkflows = await database
        .select()
        .from(workflowQueue)
        .where(
          and(
            eq(workflowQueue.status, "processing"),
            lte(workflowQueue.timeoutAt, now)
          )
        );

      if (timedOutWorkflows.length === 0) {
        console.debug("[TimeoutWorker] No timed out workflows found");
        return;
      }

      console.log(
        `[TimeoutWorker] Found ${timedOutWorkflows.length} timed out workflow(s)`
      );

      for (const workflow of timedOutWorkflows) {
        try {
          console.log(
            `[TimeoutWorker] Processing timeout for workflow ${workflow.id}`
          );

          // Execute cleanup and mark as failed
          const cleanupSuccess = await workflowQueueService.executeCleanup(
            workflow.id,
            "timeout"
          );

          if (cleanupSuccess) {
            console.log(
              `[TimeoutWorker] Successfully cleaned up workflow ${workflow.id}`
            );
          } else {
            console.warn(
              `[TimeoutWorker] Cleanup failed for workflow ${workflow.id}`
            );
          }
        } catch (error: any) {
          console.error(
            `[TimeoutWorker] Error processing timeout for workflow ${workflow.id}:`,
            error.message
          );
        }
      }
    } catch (error: any) {
      console.error("[TimeoutWorker] Error checking timeouts:", error.message);
    }
  }

  /**
   * Get worker status
   */
  getStatus(): { isRunning: boolean; checkIntervalMs: number } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
    };
  }
}

export const workflowTimeoutWorker = new WorkflowTimeoutWorker();

// Auto-start in production (optional)
// Uncomment to enable:
// if (process.env.NODE_ENV === "production") {
//   workflowTimeoutWorker.start();
// }

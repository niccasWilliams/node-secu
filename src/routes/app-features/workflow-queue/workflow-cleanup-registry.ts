import { WorkflowQueue } from "@/db/schema";

/**
 * Cleanup handler function type
 *
 * @param workflow - The workflow being cleaned up
 * @returns Promise that resolves when cleanup is complete
 */
export type CleanupHandler = (workflow: WorkflowQueue) => Promise<void>;

/**
 * Registry for workflow cleanup handlers
 *
 * Allows registering cleanup functions that are called when:
 * - Workflow is manually aborted
 * - Workflow times out
 * - Workflow fails and needs cleanup
 */
class WorkflowCleanupRegistry {
  private handlers: Map<string, CleanupHandler> = new Map();

  /**
   * Register a cleanup handler
   *
   * @param handlerId - Unique identifier for the handler
   * @param handler - Cleanup function
   *
   * @example
   * ```typescript
   * workflowCleanupRegistry.register("data_migration_cleanup", async (workflow) => {
   *   const tempDbName = workflow.payload.tempDbName;
   *   if (tempDbName) {
   *     await backupExecutorService.dropDatabase(config, tempDbName);
   *   }
   * });
   * ```
   */
  register(handlerId: string, handler: CleanupHandler): void {
    if (this.handlers.has(handlerId)) {
      console.warn(
        `[CleanupRegistry] Handler with ID "${handlerId}" already registered. Overwriting.`
      );
    }
    this.handlers.set(handlerId, handler);
    console.log(`[CleanupRegistry] Registered cleanup handler: ${handlerId}`);
  }

  /**
   * Execute cleanup handler for a workflow
   *
   * @param workflow - The workflow to clean up
   * @returns true if cleanup was successful, false if handler not found or failed
   */
  async execute(workflow: WorkflowQueue): Promise<boolean> {
    if (!workflow.cleanupHandler) {
      console.debug(
        `[CleanupRegistry] No cleanup handler registered for workflow ${workflow.id}`
      );
      return true; // No cleanup needed
    }

    const handler = this.handlers.get(workflow.cleanupHandler);
    if (!handler) {
      console.error(
        `[CleanupRegistry] Cleanup handler "${workflow.cleanupHandler}" not found for workflow ${workflow.id}`
      );
      return false;
    }

    try {
      console.log(
        `[CleanupRegistry] Executing cleanup handler "${workflow.cleanupHandler}" for workflow ${workflow.id}`
      );
      await handler(workflow);
      console.log(
        `[CleanupRegistry] Cleanup completed successfully for workflow ${workflow.id}`
      );
      return true;
    } catch (error: any) {
      console.error(
        `[CleanupRegistry] Cleanup failed for workflow ${workflow.id}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Check if a handler is registered
   */
  has(handlerId: string): boolean {
    return this.handlers.has(handlerId);
  }

  /**
   * Unregister a cleanup handler (useful for testing)
   */
  unregister(handlerId: string): boolean {
    return this.handlers.delete(handlerId);
  }

  /**
   * Get all registered handler IDs
   */
  getRegisteredHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}

export const workflowCleanupRegistry = new WorkflowCleanupRegistry();

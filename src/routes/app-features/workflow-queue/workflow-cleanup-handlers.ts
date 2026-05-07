/**
 * Workflow Cleanup Handlers
 *
 * Register all cleanup handlers here.
 * Handlers are called when workflows are aborted, timeout, or fail.
 */

import { workflowCleanupRegistry } from "./workflow-cleanup-registry";




/**
 * Migration Cleanup Handler
 *
 * Example: Restore previous state if migration was aborted
 */
workflowCleanupRegistry.register("dummy", async (workflow) => {
  console.log(`[CleanupHandler:Dummy] Cleaning up workflow ${workflow.id}`);

  // Could restore from safety backup if needed
  const payload = workflow.payload as any;
  const safetyBackupId = payload?.safetyBackupId as number | undefined;

  if (safetyBackupId) {
    console.log(
      `[CleanupHandler:Dummy] Safety backup available: ${safetyBackupId}`
    );
    // Note: Restoration would need user confirmation, so just log for now
  }
});

console.log(
  `[CleanupHandlers] Registered ${workflowCleanupRegistry.getRegisteredHandlers().length} cleanup handler(s):`,
  workflowCleanupRegistry.getRegisteredHandlers().join(", ")
);

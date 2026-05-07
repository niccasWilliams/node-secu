import { database } from "@/db";
import { eq, and, sql, inArray, desc, asc, or, like, gte, lte } from "drizzle-orm";
import { nowInBerlin } from "@/util/utils";
import {
  UserId,
  WorkflowQueue,
  workflowQueue,
  WorkflowQueueStatus,
} from "@/db/schema";
import { websocketService } from "@/lib/websockets/websocket.service.instance";

import {
  WorkflowQueueId,
  WorkflowTaskDefinition,
  WorkflowTask,
  WorkflowLogEntry,
  WorkflowTaskStatus,
  WorkflowLogLevel,
  CreateWorkflowOptions,
  WorkflowEventPayload,
  WorkflowWithETA,
  WorkflowQueryOptions,
  PaginatedWorkflowResult,
} from "./workflow-queue.types";
import { workflowCleanupRegistry } from "./workflow-cleanup-registry";

import { calculatePaginationMeta, normalizePaginationParams } from "@/types/pagination";
import { calculateWorkflowETA } from "./utils/eta-calculator";
import { generateWorkflowId } from "./utils/workflow-id.generator";

export class WorkflowQueueService {
  /**
   * Throttle map: tracks last snapshot emission time per workflow
   * Key: WorkflowQueueId, Value: timestamp (ms)
   */
  private lastSnapshotTime: Map<WorkflowQueueId, number> = new Map();

  /**
   * Throttle interval: minimum time between snapshot emissions (ms)
   */
  private readonly SNAPSHOT_THROTTLE_MS = 1000; // 1 second

  /**
   * Create a new workflow with generated ID
   */
  async createWorkflow(options: CreateWorkflowOptions): Promise<WorkflowQueue> {
    const now = nowInBerlin();
    const workflowId = generateWorkflowId(options.workflowType);

    const preparedTasks: WorkflowTask[] = (options.tasks ?? []).map((task) => ({
      key: task.key,
      label: task.label,
      expectedDurationMs: task.expectedDurationMs ?? undefined,
      status: "pending" as WorkflowTaskStatus,
    }));

    // Calculate timeout timestamp if specified
    let timeoutAt: Date | null = null;
    if (options.timeoutMinutes && options.timeoutMinutes > 0) {
      timeoutAt = new Date(now.getTime() + options.timeoutMinutes * 60 * 1000);
    }

    const [workflow] = await database
      .insert(workflowQueue)
      .values({
        id: workflowId,
        workflowType: options.workflowType,
        payload: options.payload,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        scheduledAt: options.scheduledAt ?? null,
        priority: options.priority ?? 0,
        createdBy: options.userId ? "user" : "system",
        userId: options.userId ?? null,
        tasks: preparedTasks,
        currentTask: 0,
        taskResults: [],
        cleanupHandler: options.cleanupHandler ?? null,
        timeoutAt: timeoutAt,
        abortRequested: false,
      })
      .returning();

    // First snapshot should skip throttle (workflow just created)
    this.emitWorkflowSnapshot(workflow, true);
    return workflow;
  }

  /**
   * Get workflow by ID
   */
  async getJobById(jobId: WorkflowQueueId): Promise<WorkflowQueue | undefined> {
    const job = await database
      .select()
      .from(workflowQueue)
      .where(eq(workflowQueue.id, jobId));
    return job[0];
  }

  /**
   * Get workflow with ETA calculations
   */
  async getJobByIdWithETA(jobId: WorkflowQueueId): Promise<WorkflowWithETA | undefined> {
    const workflow = await this.getJobById(jobId);
    if (!workflow) return undefined;
    return this.enrichWithETA(workflow);
  }

  /**
   * Get paginated workflows with filtering
   */
  async getWorkflows(options: WorkflowQueryOptions = {}): Promise<PaginatedWorkflowResult> {
    const { page, resultsPerPage, offset } = normalizePaginationParams(options);

    // Build WHERE conditions
    const conditions: any[] = [];

    if (options.status) {
      if (Array.isArray(options.status)) {
        conditions.push(inArray(workflowQueue.status, options.status));
      } else {
        conditions.push(eq(workflowQueue.status, options.status));
      }
    }

    if (options.workflowType) {
      if (Array.isArray(options.workflowType)) {
        conditions.push(inArray(workflowQueue.workflowType, options.workflowType));
      } else {
        conditions.push(eq(workflowQueue.workflowType, options.workflowType));
      }
    }

    if (options.userId) {
      conditions.push(eq(workflowQueue.userId, options.userId));
    }

    if (options.createdAfter) {
      conditions.push(gte(workflowQueue.createdAt, options.createdAfter));
    }

    if (options.createdBefore) {
      conditions.push(lte(workflowQueue.createdAt, options.createdBefore));
    }

    if (options.search) {
      conditions.push(
        or(
          like(workflowQueue.workflowType, `%${options.search}%`),
          like(sql`${workflowQueue.payload}::text`, `%${options.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Determine sort order with safe column mapping
    const sortBy = options.sortBy || "createdAt";
    const sortOrder = options.sortOrder || "desc";

    // Map sortBy to actual column (type-safe)
    const sortColumnMap = {
      createdAt: workflowQueue.createdAt,
      updatedAt: workflowQueue.updatedAt,
      priority: workflowQueue.priority,
      status: workflowQueue.status,
    } as const;

    const orderByColumn = sortColumnMap[sortBy] || workflowQueue.createdAt;
    const orderBy = sortOrder === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Get total count
    const [{ count }] = await database
      .select({ count: sql<number>`count(*)` })
      .from(workflowQueue)
      .where(whereClause);

    const totalResults = Number(count);

    // Get paginated data
    const workflows = await database
      .select()
      .from(workflowQueue)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(resultsPerPage)
      .offset(offset);

    // Enrich with ETA
    const enrichedWorkflows = workflows.map((wf) => this.enrichWithETA(wf));

    return {
      data: enrichedWorkflows,
      pagination: calculatePaginationMeta(totalResults, page, resultsPerPage),
    };
  }

  /**
   * Get pending workflows
   */
  async getPendingJobs(): Promise<WorkflowQueue[]> {
    const jobs = await database
      .select()
      .from(workflowQueue)
      .where(eq(workflowQueue.status, "pending"))
      .orderBy(desc(workflowQueue.priority), asc(workflowQueue.createdAt));
    return jobs;
  }

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(
    jobId: WorkflowQueueId,
    status: WorkflowQueueStatus
  ): Promise<WorkflowQueue | undefined> {
    return this.updateWorkflow(jobId, { status });
  }

  /**
   * Update workflow (generic)
   *
   * @param id - Workflow ID
   * @param updates - Fields to update
   * @param skipThrottle - If true, bypass throttling for snapshot emission
   */
  async updateWorkflow(
    id: WorkflowQueueId,
    updates: Partial<WorkflowQueue>,
    skipThrottle: boolean = false
  ): Promise<WorkflowQueue | undefined> {
    const [workflow] = await database
      .update(workflowQueue)
      .set({
        ...updates,
        updatedAt: nowInBerlin(),
      })
      .where(eq(workflowQueue.id, id))
      .returning();

    this.emitWorkflowSnapshot(workflow, skipThrottle);
    return workflow;
  }

  /**
   * Set workflow tasks
   */
  async setTasks(
    jobId: WorkflowQueueId,
    tasks: WorkflowTask[]
  ): Promise<WorkflowQueue | undefined> {
    return this.updateWorkflow(jobId, { tasks });
  }

  /**
   * Start a specific task
   */
  async startTask(
    jobId: WorkflowQueueId,
    taskKey: string
  ): Promise<WorkflowQueue | undefined> {
    return this.updateTaskStatus(jobId, taskKey, "running");
  }

  /**
   * Complete a specific task
   */
  async completeTask(
    jobId: WorkflowQueueId,
    taskKey: string
  ): Promise<WorkflowQueue | undefined> {
    return this.updateTaskStatus(jobId, taskKey, "completed");
  }

  /**
   * Fail a specific task
   */
  async failTask(
    jobId: WorkflowQueueId,
    taskKey: string
  ): Promise<WorkflowQueue | undefined> {
    return this.updateTaskStatus(jobId, taskKey, "failed");
  }

  /**
   * Update progress percentage for a running task
   * This triggers a throttled workflow snapshot update with updated progress
   *
   * @param jobId - Workflow ID
   * @param taskKey - Task key
   * @param progressPercent - Progress percentage (0-100)
   */
  async updateTaskProgress(
    jobId: WorkflowQueueId,
    taskKey: string,
    progressPercent: number
  ): Promise<void> {
    const workflow = await this.getJobById(jobId);
    if (!workflow) {
      console.warn(`Workflow ${jobId} not found for progress update`);
      return;
    }

    // Update the task's progressPercent in the database
    const tasks = this.deserializeTasks(workflow.tasks);
    const updatedTasks = tasks.map((task) => {
      if (task.key === taskKey && task.status === "running") {
        return {
          ...task,
          progressPercent: Math.min(100, Math.max(0, progressPercent)),
        };
      }
      return task;
    });

    // Update database with new progress
    const [updatedWorkflow] = await database
      .update(workflowQueue)
      .set({
        tasks: updatedTasks as any,
        updatedAt: nowInBerlin(),
      })
      .where(eq(workflowQueue.id, jobId))
      .returning();

    // Emit throttled workflow snapshot to trigger frontend update
    // This is throttled to prevent flooding the client (max 1/sec)
    this.emitWorkflowSnapshot(updatedWorkflow, false);
  }

  /**
   * Append log entry to workflow
   *
   * NOTE: This method only emits a workflow_log event, NOT a full snapshot.
   * This prevents flooding the client with redundant updates.
   */
  async appendTaskResult(
    jobId: WorkflowQueueId,
    entry: Omit<WorkflowLogEntry, "timestamp">
  ): Promise<WorkflowQueue | undefined> {
    const workflow = await this.getJobById(jobId);
    if (!workflow) {
      throw new Error(`Workflow with ID ${jobId} not found`);
    }

    const currentLog: WorkflowLogEntry[] = Array.isArray(workflow.taskResults)
      ? (workflow.taskResults as WorkflowLogEntry[])
      : [];

    const newEntry: WorkflowLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    const updatedLog = [...currentLog, newEntry];

    // Update database directly without emitting snapshot
    const [updatedWorkflow] = await database
      .update(workflowQueue)
      .set({
        taskResults: updatedLog as any,
        updatedAt: nowInBerlin(),
      })
      .where(eq(workflowQueue.id, jobId))
      .returning();

    // Emit ONLY the log event, not a full snapshot
    // This reduces WebSocket traffic significantly
    this.emitWorkflowEvent(jobId, {
      type: "workflow_log",
      workflowId: jobId,
      data: newEntry,
    });

    return updatedWorkflow;
  }

  /**
   * Increment workflow attempt count
   */
  async incrementWorkflowAttemptCount(
    jobId: WorkflowQueueId
  ): Promise<WorkflowQueue | undefined> {
    const [workflow] = await database
      .update(workflowQueue)
      .set({
        attemptCount: sql`${workflowQueue.attemptCount} + 1`,
        lastAttemptAt: nowInBerlin(),
        updatedAt: nowInBerlin(),
      })
      .where(eq(workflowQueue.id, jobId))
      .returning();

    // Retry is important, skip throttle
    this.emitWorkflowSnapshot(workflow, true);
    return workflow;
  }

  /**
   * Delete a single workflow
   */
  async deleteJob(jobId: WorkflowQueueId): Promise<void> {
    await database.delete(workflowQueue).where(eq(workflowQueue.id, jobId));

    const ws = websocketService();
    ws?.sendWorkflowEvent(jobId, {
      type: "workflow_deleted",
      workflowId: jobId,
      data: { status: "deleted" },
    });
  }

  /**
   * Delete multiple workflows
   */
  async deleteJobs(jobIds: WorkflowQueueId[]): Promise<void> {
    await database
      .delete(workflowQueue)
      .where(inArray(workflowQueue.id, jobIds));

    const ws = websocketService();
    jobIds.forEach((id) =>
      ws?.sendWorkflowEvent(id, {
        type: "workflow_deleted",
        workflowId: id,
        data: { status: "deleted" },
      })
    );
  }

  /**
   * Cancel a pending workflow
   */
  async cancelJobById(jobId: WorkflowQueueId): Promise<WorkflowQueue | undefined> {
    const [workflow] = await database
      .update(workflowQueue)
      .set({
        status: "canceled",
        updatedAt: nowInBerlin(),
      })
      .where(
        and(
          eq(workflowQueue.status, "pending"),
          eq(workflowQueue.id, jobId)
        )
      )
      .returning();

    // Status change is important, skip throttle
    this.emitWorkflowSnapshot(workflow, true);
    return workflow;
  }

  /**
   * Request abort for a running workflow
   * Sets abortRequested flag - the workflow must check this and cleanup
   *
   * @param jobId - Workflow ID
   * @returns Updated workflow or undefined if not found/not processing
   */
  async requestAbort(jobId: WorkflowQueueId): Promise<WorkflowQueue | undefined> {
    const workflow = await this.getJobById(jobId);
    if (!workflow) {
      console.warn(`[WorkflowQueue] Workflow ${jobId} not found for abort`);
      return undefined;
    }

    // Only processing workflows can be aborted
    if (workflow.status !== "processing") {
      console.warn(
        `[WorkflowQueue] Cannot abort workflow ${jobId} with status: ${workflow.status}`
      );
      return undefined;
    }

    console.log(`[WorkflowQueue] Abort requested for workflow ${jobId}`);

    // Set abort flag
    const [updated] = await database
      .update(workflowQueue)
      .set({
        abortRequested: true,
        updatedAt: nowInBerlin(),
      })
      .where(eq(workflowQueue.id, jobId))
      .returning();

    // Emit snapshot with abort flag
    this.emitWorkflowSnapshot(updated, true);

    return updated;
  }

  /**
   * Check if abort has been requested for a workflow
   * Workflows should call this periodically during execution
   *
   * @param jobId - Workflow ID
   * @returns true if abort requested
   */
  async isAbortRequested(jobId: WorkflowQueueId): Promise<boolean> {
    const [result] = await database
      .select({ abortRequested: workflowQueue.abortRequested })
      .from(workflowQueue)
      .where(eq(workflowQueue.id, jobId))
      .limit(1);

    return result?.abortRequested ?? false;
  }

  /**
   * Execute cleanup for a workflow and mark it as canceled
   *
   * @param jobId - Workflow ID
   * @param reason - Reason for cleanup (abort, timeout, error)
   * @returns true if cleanup was successful
   */
  async executeCleanup(
    jobId: WorkflowQueueId,
    reason: "abort" | "timeout" | "error" = "abort"
  ): Promise<boolean> {
    const workflow = await this.getJobById(jobId);
    if (!workflow) {
      console.warn(`[WorkflowQueue] Workflow ${jobId} not found for cleanup`);
      return false;
    }

    console.log(
      `[WorkflowQueue] Executing cleanup for workflow ${jobId} (reason: ${reason})`
    );

    // Notify frontend that cleanup is starting
    const reasonText = reason === "abort" ? "abgebrochen" : reason === "timeout" ? "Timeout" : "Fehler";
    await this.appendTaskResult(jobId, {
      level: "info",
      message: `Workflow ${reasonText} - Bereinigung läuft...`,
    });

    // Execute cleanup handler if registered
    let cleanupSuccess = true;
    if (workflow.cleanupHandler) {
      console.log(`[WorkflowQueue] Executing cleanup handler: ${workflow.cleanupHandler}`);
      cleanupSuccess = await workflowCleanupRegistry.execute(workflow);
    } else {
      console.log(`[WorkflowQueue] No cleanup handler registered for workflow ${jobId}`);
    }

    // Mark workflow as canceled/failed
    const finalStatus: WorkflowQueueStatus =
      reason === "error" ? "failed" : "canceled";

    await this.updateWorkflow(
      jobId,
      {
        status: finalStatus,
        abortRequested: false, // Reset flag
      },
      true // skipThrottle
    );

    // Log cleanup result
    await this.appendTaskResult(jobId, {
      level: cleanupSuccess ? "info" : "warning",
      message: cleanupSuccess
        ? `Bereinigung erfolgreich abgeschlossen`
        : `Bereinigung fehlgeschlagen - manuelle Überprüfung erforderlich`,
    });

    return cleanupSuccess;
  }

  /**
   * Mark workflow as completed
   */
  async markCompleted(
    jobId: WorkflowQueueId,
    finalPayload?: any
  ): Promise<WorkflowQueue | undefined> {
    // Final status change is critical, skip throttle
    const workflow = await this.updateWorkflow(
      jobId,
      {
        status: "completed",
        payload: finalPayload ?? sql`${workflowQueue.payload}`,
      },
      true // skipThrottle
    );

    if (workflow) {
      this.emitWorkflowEvent(workflow.id, {
        type: "workflow_status",
        workflowId: workflow.id,
        data: { status: "completed", payload: finalPayload },
      });
    }

    return workflow;
  }

  /**
   * Mark workflow as failed
   */
  async markFailed(
    jobId: WorkflowQueueId,
    errorMessage: string
  ): Promise<WorkflowQueue | undefined> {
    await this.appendTaskResult(jobId, {
      level: "error",
      message: errorMessage,
    });

    // Final status change is critical, skip throttle
    const workflow = await this.updateWorkflow(
      jobId,
      { status: "failed" },
      true // skipThrottle
    );

    if (workflow) {
      this.emitWorkflowEvent(workflow.id, {
        type: "workflow_status",
        workflowId: workflow.id,
        data: { status: "failed", errorMessage },
      });
    }

    return workflow;
  }

  /**
   * Retry a failed workflow (creates new workflow with same params)
   */
  async retryWorkflow(jobId: WorkflowQueueId): Promise<WorkflowQueue | undefined> {
    const originalWorkflow = await this.getJobById(jobId);
    if (!originalWorkflow) {
      throw new Error(`Workflow with ID ${jobId} not found`);
    }

    if (originalWorkflow.status !== "failed" && originalWorkflow.status !== "canceled") {
      throw new Error(`Can only retry failed or canceled workflows`);
    }

    // Extract original task definitions
    const tasks = this.deserializeTasks(originalWorkflow.tasks);
    const taskDefinitions: WorkflowTaskDefinition[] = tasks.map((t) => ({
      key: t.key,
      label: t.label,
      expectedDurationMs: t.expectedDurationMs,
    }));

    // Create new workflow with same parameters
    return this.createWorkflow({
      workflowType: originalWorkflow.workflowType,
      payload: originalWorkflow.payload,
      userId: originalWorkflow.userId ?? undefined,
      tasks: taskDefinitions,
      priority: originalWorkflow.priority,
    });
  }

  /**
   * Enrich workflow with ETA calculations
   */
  private enrichWithETA(workflow: WorkflowQueue): WorkflowWithETA {
    const tasks = this.deserializeTasks(workflow.tasks);
    const eta = calculateWorkflowETA(tasks, workflow.createdAt);

    return {
      ...workflow,
      estimatedCompletionAt: eta.estimatedCompletionAt?.toISOString() ?? null,
      estimatedRemainingMs: eta.estimatedRemainingMs,
      currentProgress: eta.currentProgress,
      totalEstimatedDurationMs: eta.totalEstimatedDurationMs,
    };
  }

  /**
   * Update task status
   *
   * Task status changes are important updates that should skip throttling
   */
  private async updateTaskStatus(
    jobId: WorkflowQueueId,
    taskKey: string,
    status: WorkflowTaskStatus
  ): Promise<WorkflowQueue | undefined> {
    const workflow = await this.getJobById(jobId);
    if (!workflow) {
      throw new Error(`Workflow with ID ${jobId} not found`);
    }

    const tasks = this.deserializeTasks(workflow.tasks);
    const timestamp = new Date().toISOString();
    let currentTaskIndex = workflow.currentTask ?? 0;

    const updatedTasks = tasks.map((task, index) => {
      if (task.key !== taskKey) {
        return task;
      }

      if (status === "running") {
        currentTaskIndex = index;
        return {
          ...task,
          status,
          startedAt: timestamp,
          finishedAt: undefined,
          progressPercent: 0, // Reset progress when task starts
        };
      }

      return {
        ...task,
        status,
        finishedAt: status === "completed" || status === "failed" ? timestamp : task.finishedAt,
        progressPercent: status === "completed" ? 100 : task.progressPercent,
      };
    });

    // Task status changes are important, skip throttle
    return this.updateWorkflow(
      jobId,
      {
        tasks: updatedTasks as any,
        currentTask: currentTaskIndex,
      },
      true // skipThrottle
    );
  }

  /**
   * Deserialize tasks from JSONB
   */
  private deserializeTasks(raw: any): WorkflowTask[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw as WorkflowTask[];
    }
    return [];
  }

  /**
   * Emit workflow snapshot with ETA to WebSocket clients
   *
   * @param workflow - Workflow to emit
   * @param skipThrottle - If true, bypass throttling (for important updates)
   */
  private emitWorkflowSnapshot(workflow?: WorkflowQueue, skipThrottle: boolean = false) {
    if (!workflow) return;

    // Apply throttling unless explicitly skipped
    if (!skipThrottle) {
      const now = Date.now();
      const lastEmit = this.lastSnapshotTime.get(workflow.id) || 0;
      const timeSinceLastEmit = now - lastEmit;

      if (timeSinceLastEmit < this.SNAPSHOT_THROTTLE_MS) {
        // Too soon, skip this emission
        console.debug(
          `[WorkflowQueue] Throttled snapshot for ${workflow.id} (${timeSinceLastEmit}ms since last)`
        );
        return;
      }

      // Update last emission time
      this.lastSnapshotTime.set(workflow.id, now);
    }

    const enriched = this.enrichWithETA(workflow);

    this.emitWorkflowEvent(workflow.id, {
      type: "workflow_update",
      workflowId: workflow.id,
      data: enriched,
    });
  }

  /**
   * Emit workflow event to WebSocket clients
   */
  private emitWorkflowEvent(workflowId: WorkflowQueueId, event: WorkflowEventPayload) {
    try {
      const ws = websocketService?.();
      ws?.sendWorkflowEvent(workflowId, event);
    } catch (error) {
      console.warn("Failed to emit workflow event:", error);
    }
  }
}

export const workflowQueueService = new WorkflowQueueService();

import { WorkflowQueue } from "@/db/schema";
import {
  workflowQueueService,
  WorkflowQueueService,
} from "./workflow-queue.service";
import {
  WorkflowQueueId,
  WorkflowLogLevel,
  CreateWorkflowOptions,
} from "./workflow-queue.types";

// Re-export for backward compatibility
type InitializeWorkflowOptions = CreateWorkflowOptions;

export interface LogOptions {
  taskKey?: string;
  level?: WorkflowLogLevel;
  message: string;
  data?: any;
}

export class WorkflowProgressHandle {
  constructor(
    private readonly workflowId: WorkflowQueueId,
    private readonly service: WorkflowQueueService
  ) {}

  get id(): WorkflowQueueId {
    return this.workflowId;
  }

  async startTask(taskKey: string, message?: string) {
    await this.service.startTask(this.workflowId, taskKey);
    if (message) {
      await this.service.appendTaskResult(this.workflowId, {
        taskKey,
        level: "info",
        message,
      });
    }
  }

  async completeTask(taskKey: string, message?: string) {
    await this.service.completeTask(this.workflowId, taskKey);
    if (message) {
      await this.service.appendTaskResult(this.workflowId, {
        taskKey,
        level: "info",
        message,
      });
    }
  }

  async failTask(taskKey: string, errorMessage: string) {
    await this.service.failTask(this.workflowId, taskKey);
    await this.service.appendTaskResult(this.workflowId, {
      taskKey,
      level: "error",
      message: errorMessage,
    });
  }

  /**
   * Update sub-task progress (0-100%)
   * This enables smooth progress bar updates in the frontend
   *
   * @param taskKey - Task identifier
   * @param progressPercent - Progress percentage (0-100)
   * @param message - Optional log message (only logged at specific milestones to reduce noise)
   */
  async updateProgress(taskKey: string, progressPercent: number, message?: string) {
    // Update task progress (throttled to max 1 snapshot/sec)
    await this.service.updateTaskProgress(this.workflowId, taskKey, progressPercent);

    // Only log if message is provided (recommended: log at 25%, 50%, 75%, 100% milestones)
    if (message) {
      await this.service.appendTaskResult(this.workflowId, {
        taskKey,
        level: "info",
        message,
        data: { progressPercent },
      });
    }
  }

  async log(options: LogOptions) {
    await this.service.appendTaskResult(this.workflowId, {
      taskKey: options.taskKey,
      level: options.level ?? "info",
      message: options.message,
      data: options.data,
    });
  }

  async markCompleted(finalPayload?: any) {
    await this.service.markCompleted(this.workflowId, finalPayload);
  }

  async markFailed(errorMessage: string) {
    await this.service.markFailed(this.workflowId, errorMessage);
  }
}

class WorkflowProgressService {
  constructor(
    private readonly service: WorkflowQueueService = workflowQueueService
  ) {}

  async initializeWorkflow(
    options: InitializeWorkflowOptions
  ): Promise<{ workflow: WorkflowQueue; handle: WorkflowProgressHandle }> {
    const workflow = await this.service.createWorkflow(options);
    const handle = new WorkflowProgressHandle(workflow.id, this.service);
    return { workflow, handle };
  }
}

export const workflowProgressService = new WorkflowProgressService();

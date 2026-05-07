import { WorkflowQueue, WorkflowQueueStatus, UserId } from "@/db/schema";
import { PaginatedResult } from "@/types/pagination";


/**
 * Workflow ID type - String format: WF_<timestamp>_<hash>
 */
export type WorkflowQueueId = string;

/**
 * Workflow task status
 */
export type WorkflowTaskStatus = "pending" | "running" | "completed" | "failed";

/**
 * Workflow log level
 */
export type WorkflowLogLevel = "info" | "warning" | "error";

/**
 * Workflow task definition (minimal, used when creating)
 */
export interface WorkflowTaskDefinition {
  key: string;
  label: string;
  expectedDurationMs?: number;
}

/**
 * Workflow task (full, includes status and timestamps)
 */
export interface WorkflowTask extends WorkflowTaskDefinition {
  status: WorkflowTaskStatus;
  startedAt?: string;
  finishedAt?: string;
  progressPercent?: number; // 0-100, for sub-task progress tracking
}

/**
 * Workflow log entry
 */
export interface WorkflowLogEntry {
  timestamp: string;
  taskKey?: string;
  level: WorkflowLogLevel;
  message: string;
  data?: any;
}

/**
 * Options for creating a new workflow
 */
export interface CreateWorkflowOptions {
  workflowType: string;
  payload: any;
  userId?: UserId;
  tasks?: WorkflowTaskDefinition[];
  priority?: number;
  scheduledAt?: Date | null;
  cleanupHandler?: string; // Cleanup function identifier for abort/timeout
  timeoutMinutes?: number; // Automatic timeout in minutes
}

/**
 * Extended workflow data with ETA calculations
 */
export interface WorkflowWithETA extends WorkflowQueue {
  estimatedCompletionAt: string | null;
  estimatedRemainingMs: number;
  currentProgress: number;
  totalEstimatedDurationMs: number;
}

/**
 * Filter options for workflow queries
 */
export interface WorkflowFilterOptions {
  status?: WorkflowQueueStatus | WorkflowQueueStatus[];
  workflowType?: string | string[];
  userId?: UserId;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string; // Search in workflowType or payload
}

/**
 * Sort options for workflow queries
 */
export interface WorkflowSortOptions {
  sortBy?: "createdAt" | "updatedAt" | "priority" | "status";
  sortOrder?: "asc" | "desc";
}

/**
 * Query options for listing workflows
 */
export interface WorkflowQueryOptions extends WorkflowFilterOptions, WorkflowSortOptions {
  page?: number;
  resultsPerPage?: number;
}

/**
 * Paginated workflow result
 */
export type PaginatedWorkflowResult = PaginatedResult<WorkflowWithETA>;

/**
 * Workflow statistics
 */
export interface WorkflowStatistics {
  totalWorkflows: number;
  byStatus: Record<WorkflowQueueStatus, number>;
  byType: Record<string, number>;
  averageDurationMs: number;
  successRate: number;
}

/**
 * Workflow event types for WebSocket
 */
export type WorkflowEventType =
  | "workflow_update"   // Full workflow snapshot
  | "workflow_status"   // Status change only
  | "workflow_log"      // New log entry
  | "workflow_joined"   // Client joined channel
  | "workflow_deleted"; // Workflow deleted

/**
 * WebSocket workflow event payload
 */
export interface WorkflowEventPayload {
  type: WorkflowEventType;
  workflowId: WorkflowQueueId;
  data?: any;
}

/**
 * Initial workflow response (returned when starting a workflow)
 */
export interface InitialWorkflowResponse {
  workflowId: WorkflowQueueId;
  websocketChannel: string;
  workflow: WorkflowWithETA;
  workflowType: string;
}

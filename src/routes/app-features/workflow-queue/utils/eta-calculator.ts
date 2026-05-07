/**
 * Workflow task status type
 */
export type WorkflowTaskStatus = "pending" | "running" | "completed" | "failed";

/**
 * Minimal task interface for ETA calculation
 */
export interface TaskForETA {
  status: WorkflowTaskStatus;
  expectedDurationMs?: number;
  startedAt?: string;
  finishedAt?: string;
  progressPercent?: number; // 0-100, sub-task progress
}

/**
 * ETA calculation result
 */
export interface ETAResult {
  estimatedCompletionAt: Date | null;
  estimatedRemainingMs: number;
  currentProgress: number; // 0-100
  isComplete: boolean;
  totalEstimatedDurationMs: number;
}

/**
 * Calculates ETA and progress for a workflow based on its tasks
 *
 * @param tasks - Array of workflow tasks
 * @param workflowStartedAt - When the workflow started (ISO string or Date)
 * @returns ETA calculation result
 */
export function calculateWorkflowETA(
  tasks: TaskForETA[],
  workflowStartedAt?: string | Date
): ETAResult {
  if (!tasks || tasks.length === 0) {
    return {
      estimatedCompletionAt: null,
      estimatedRemainingMs: 0,
      currentProgress: 0,
      isComplete: false,
      totalEstimatedDurationMs: 0,
    };
  }

  // Calculate total estimated duration from all tasks
  const totalEstimatedDurationMs = tasks.reduce(
    (sum, task) => sum + (task.expectedDurationMs || 0),
    0
  );

  // Count completed and failed tasks
  const completedTasks = tasks.filter(
    (t) => t.status === "completed" || t.status === "failed"
  ).length;

  const allTasksComplete = completedTasks === tasks.length;

  // If all tasks complete, return 100% progress
  if (allTasksComplete) {
    return {
      estimatedCompletionAt: null,
      estimatedRemainingMs: 0,
      currentProgress: 100,
      isComplete: true,
      totalEstimatedDurationMs,
    };
  }

  // Calculate weighted progress percentage with sub-task progress
  // Each task contributes based on its weight (duration or equal weight)
  const hasExpectedDurations = tasks.some((t) => t.expectedDurationMs && t.expectedDurationMs > 0);

  let currentProgress = 0;

  if (hasExpectedDurations && totalEstimatedDurationMs > 0) {
    // Weight by duration
    const completedDurationMs = tasks.reduce((sum, task) => {
      if (task.status === "completed" || task.status === "failed") {
        // Task is done, count full duration
        return sum + (task.expectedDurationMs || 0);
      } else if (task.status === "running" && task.progressPercent !== undefined) {
        // Task is running, count partial duration based on progressPercent
        const taskDuration = task.expectedDurationMs || 0;
        return sum + (taskDuration * (task.progressPercent / 100));
      }
      // Pending tasks contribute 0
      return sum;
    }, 0);

    currentProgress = Math.round((completedDurationMs / totalEstimatedDurationMs) * 100);
  } else {
    // Weight equally (fallback if no durations specified)
    const totalWeight = tasks.length;
    const completedWeight = tasks.reduce((sum, task) => {
      if (task.status === "completed" || task.status === "failed") {
        return sum + 1;
      } else if (task.status === "running" && task.progressPercent !== undefined) {
        return sum + (task.progressPercent / 100);
      }
      return sum;
    }, 0);

    currentProgress = Math.round((completedWeight / totalWeight) * 100);
  }

  // Calculate remaining duration from pending and running tasks
  const estimatedRemainingMs = tasks
    .filter((t) => t.status === "pending" || t.status === "running")
    .reduce((sum, task) => {
      if (task.status === "running" && task.expectedDurationMs) {
        const taskDuration = task.expectedDurationMs;

        // Use progressPercent if available for more accurate estimation
        if (task.progressPercent !== undefined && task.progressPercent > 0) {
          const remaining = taskDuration * ((100 - task.progressPercent) / 100);
          return sum + Math.max(0, remaining);
        }

        // Fallback to elapsed time calculation
        if (task.startedAt) {
          const elapsed = Date.now() - new Date(task.startedAt).getTime();
          const remaining = Math.max(0, taskDuration - elapsed);
          return sum + remaining;
        }

        // If no progress info, assume full duration remaining
        return sum + taskDuration;
      }
      return sum + (task.expectedDurationMs || 0);
    }, 0);

  // Calculate estimated completion time
  let estimatedCompletionAt: Date | null = null;
  if (estimatedRemainingMs > 0) {
    estimatedCompletionAt = new Date(Date.now() + estimatedRemainingMs);
  }

  return {
    estimatedCompletionAt,
    estimatedRemainingMs,
    currentProgress,
    isComplete: false,
    totalEstimatedDurationMs,
  };
}

/**
 * Formats duration in milliseconds to human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

/**
 * Calculates actual duration of a completed task
 *
 * @param task - Task with startedAt and finishedAt
 * @returns Duration in milliseconds, or null if incomplete
 */
export function calculateActualTaskDuration(task: {
  startedAt?: string;
  finishedAt?: string;
}): number | null {
  if (!task.startedAt || !task.finishedAt) {
    return null;
  }

  const start = new Date(task.startedAt).getTime();
  const end = new Date(task.finishedAt).getTime();

  return end - start;
}

/**
 * Calculates the accuracy of time estimates
 *
 * @param tasks - Array of completed tasks
 * @returns Average accuracy percentage (100 = perfect estimate)
 */
export function calculateEstimateAccuracy(
  tasks: Array<{
    expectedDurationMs?: number;
    startedAt?: string;
    finishedAt?: string;
  }>
): number | null {
  const completedTasksWithEstimates = tasks.filter(
    (t) => t.expectedDurationMs && t.startedAt && t.finishedAt
  );

  if (completedTasksWithEstimates.length === 0) {
    return null;
  }

  const accuracies = completedTasksWithEstimates.map((task) => {
    const actual = calculateActualTaskDuration(task)!;
    const expected = task.expectedDurationMs!;

    if (expected === 0) return 100;

    // Calculate percentage difference
    const accuracy = (actual / expected) * 100;
    return Math.min(200, Math.max(0, accuracy)); // Cap at 0-200%
  });

  const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;

  return Math.round(avgAccuracy);
}

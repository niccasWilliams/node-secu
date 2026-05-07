import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { workflowQueueService } from "./workflow-queue.service";
import { WorkflowQueueId, WorkflowQueryOptions } from "./workflow-queue.types";
import { isValidWorkflowId } from "./utils/workflow-id.generator";



class WorkflowQueueController {
  /**
   * GET /workflows/:workflowId
   * Get a single workflow by ID with ETA calculations
   */
  async getWorkflowById(req: Request, res: Response) {
    try {
      const workflowId = req.params.workflowId as WorkflowQueueId;

      if (!isValidWorkflowId(workflowId)) {
        return responseHandler(res, 400, "Invalid workflow ID format");
      }

      const workflow = await workflowQueueService.getJobByIdWithETA(workflowId);
      if (!workflow) {
        return responseHandler(res, 404, "Workflow not found");
      }

      return responseHandler(res, 200, "Workflow retrieved successfully", workflow);
    } catch (error) {
      console.error("Error retrieving workflow:", error);
      return responseHandler(res, 500, "Internal server error");
    }
  }

  /**
   * GET /workflows
   * List workflows with pagination and filtering
   */
  async listWorkflows(req: Request, res: Response) {
    try {
      const {
        page,
        resultsPerPage,
        status,
        workflowType,
        userId,
        createdAfter,
        createdBefore,
        search,
        sortBy,
        sortOrder,
      } = req.query;

      const options: WorkflowQueryOptions = {
        page: page ? parseInt(page as string, 10) : undefined,
        resultsPerPage: resultsPerPage ? parseInt(resultsPerPage as string, 10) : undefined,
        status: status
          ? Array.isArray(status)
            ? (status as any)
            : (status as any)
          : undefined,
        workflowType: workflowType
          ? Array.isArray(workflowType)
            ? (workflowType as string[])
            : (workflowType as string)
          : undefined,
        userId: userId ? parseInt(userId as string, 10) : undefined,
        createdAfter: createdAfter ? new Date(createdAfter as string) : undefined,
        createdBefore: createdBefore ? new Date(createdBefore as string) : undefined,
        search: search as string,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
      };

      const result = await workflowQueueService.getWorkflows(options);

      return responseHandler(res, 200, "Workflows retrieved successfully", result);
    } catch (error) {
      console.error("Error listing workflows:", error);
      return responseHandler(res, 500, "Internal server error");
    }
  }





  /**
   * DELETE /workflows/:workflowId
   * Delete a single workflow
   */
  async deleteWorkflow(req: Request, res: Response) {
    try {
      const workflowId = req.params.workflowId as WorkflowQueueId;

      if (!isValidWorkflowId(workflowId)) {
        return responseHandler(res, 400, "Invalid workflow ID format");
      }

      // Check if workflow exists
      const workflow = await workflowQueueService.getJobById(workflowId);
      if (!workflow) {
        return responseHandler(res, 404, "Workflow not found");
      }

      await workflowQueueService.deleteJob(workflowId);

      return responseHandler(res, 200, "Workflow deleted successfully");
    } catch (error) {
      console.error("Error deleting workflow:", error);
      return responseHandler(res, 500, "Internal server error");
    }
  }

  /**
   * DELETE /workflows (bulk delete)
   * Delete multiple workflows
   */
  async deleteWorkflows(req: Request, res: Response) {
    try {
      const { workflowIds } = req.body;

      if (!Array.isArray(workflowIds) || workflowIds.length === 0) {
        return responseHandler(res, 400, "workflowIds must be a non-empty array");
      }

      // Validate all IDs
      const invalidIds = workflowIds.filter((id) => !isValidWorkflowId(id));
      if (invalidIds.length > 0) {
        return responseHandler(
          res,
          400,
          `Invalid workflow IDs: ${invalidIds.join(", ")}`
        );
      }

      await workflowQueueService.deleteJobs(workflowIds);

      return responseHandler(
        res,
        200,
        `${workflowIds.length} workflow(s) deleted successfully`
      );
    } catch (error) {
      console.error("Error deleting workflows:", error);
      return responseHandler(res, 500, "Internal server error");
    }
  }

  /**
   * POST /workflows/:workflowId/cancel
   * Cancel a pending workflow or abort a running workflow
   *
   * - pending workflows: immediately canceled
   * - processing workflows: abort requested, cleanup handler called
   * - completed/failed/canceled: cannot be canceled
   */
  async cancelWorkflow(req: Request, res: Response) {
    try {
      const workflowId = req.params.workflowId as WorkflowQueueId;

      if (!isValidWorkflowId(workflowId)) {
        return responseHandler(res, 400, "Invalid workflow ID format");
      }

      // Check if workflow exists
      const existingWorkflow = await workflowQueueService.getJobById(workflowId);
      if (!existingWorkflow) {
        return responseHandler(res, 404, "Workflow not found");
      }

      // Handle based on status
      if (existingWorkflow.status === "pending") {
        // Cancel pending workflow immediately
        const workflow = await workflowQueueService.cancelJobById(workflowId);
        return responseHandler(res, 200, "Workflow canceled successfully", workflow);
      } else if (existingWorkflow.status === "processing") {
        // Request abort for running workflow
        const workflow = await workflowQueueService.requestAbort(workflowId);

        if (!workflow) {
          return responseHandler(
            res,
            500,
            "Failed to request abort for running workflow"
          );
        }

        return responseHandler(
          res,
          202, // Accepted - abort requested
          "Abort requested for running workflow. Cleanup will be performed.",
          {
            ...workflow,
            note: "The workflow will check for abort and cleanup resources. Monitor status for completion.",
          }
        );
      } else {
        // Cannot cancel completed/failed/canceled workflows
        return responseHandler(
          res,
          400,
          `Cannot cancel workflow with status: ${existingWorkflow.status}. Only pending or processing workflows can be canceled.`
        );
      }
    } catch (error) {
      console.error("Error canceling workflow:", error);
      return responseHandler(res, 500, "Internal server error");
    }
  }

  /**
   * POST /workflows/:workflowId/retry
   * Retry a failed or canceled workflow (creates new workflow)
   */
  async retryWorkflow(req: Request, res: Response) {
    try {
      const workflowId = req.params.workflowId as WorkflowQueueId;

      if (!isValidWorkflowId(workflowId)) {
        return responseHandler(res, 400, "Invalid workflow ID format");
      }

      // Check if workflow exists
      const existingWorkflow = await workflowQueueService.getJobById(workflowId);
      if (!existingWorkflow) {
        return responseHandler(res, 404, "Workflow not found");
      }

      // Only failed or canceled workflows can be retried
      if (
        existingWorkflow.status !== "failed" &&
        existingWorkflow.status !== "canceled"
      ) {
        return responseHandler(
          res,
          400,
          `Cannot retry workflow with status: ${existingWorkflow.status}. Only failed or canceled workflows can be retried.`
        );
      }

      const newWorkflow = await workflowQueueService.retryWorkflow(workflowId);

      return responseHandler(
        res,
        201,
        "Workflow retry created successfully",
        {
          originalWorkflowId: workflowId,
          newWorkflowId: newWorkflow?.id,
          workflow: newWorkflow,
        }
      );
    } catch (error) {
      console.error("Error retrying workflow:", error);
      return responseHandler(res, 500, "Internal server error");
    }
  }
}

export const workflowQueueController = new WorkflowQueueController();

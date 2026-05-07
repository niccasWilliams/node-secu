import { Router } from "express";

import { workflowQueueController } from "./workflow-queue.controller";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import {
  deleteWorkflowsBodySchema,
  listWorkflowsQuerySchema,
  workflowIdParamSchema,
} from "./workflow-queue.dto";

const c = createContractRouter("/workflows", { tags: ["workflow-queue"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
  "/",
  validate({ query: listWorkflowsQuerySchema }),
  contract({
    operationId: "workflow_queue_list",
    summary: "List workflows",
    auth: { type: "frontend_bearer_http" },
    request: { query: listWorkflowsQuerySchema },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr("PaginatedResult<WorkflowQueue>", ["PaginatedResult", "WorkflowQueue"]),
      },
    ],
  }),
  workflowQueueController.listWorkflows
);

c.get(
  "/:workflowId",
  validate({ params: workflowIdParamSchema }),
  contract({
    operationId: "workflow_queue_get_by_id",
    summary: "Get workflow by id",
    auth: { type: "frontend_bearer_http" },
    request: { params: workflowIdParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("WorkflowQueue", ["WorkflowQueue"]) }],
  }),
  workflowQueueController.getWorkflowById
);

c.delete(
  "/:workflowId",
  validate({ params: workflowIdParamSchema }),
  contract({
    operationId: "workflow_queue_delete",
    summary: "Delete workflow",
    auth: { type: "frontend_bearer_http" },
    request: { params: workflowIdParamSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  workflowQueueController.deleteWorkflow
);

c.delete(
  "/",
  validate({ body: deleteWorkflowsBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "workflow_queue_delete_bulk",
    summary: "Delete multiple workflows",
    auth: { type: "frontend_bearer_http" },
    request: { body: deleteWorkflowsBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  workflowQueueController.deleteWorkflows
);

c.post(
  "/:workflowId/cancel",
  validate({ params: workflowIdParamSchema }),
  contract({
    operationId: "workflow_queue_cancel",
    summary: "Cancel or abort workflow",
    auth: { type: "frontend_bearer_http" },
    request: { params: workflowIdParamSchema },
    responses: [
      { kind: "json", status: 200, data: require("zod").any() },
      { kind: "json", status: 202, data: require("zod").any() },
    ],
  }),
  workflowQueueController.cancelWorkflow
);

c.post(
  "/:workflowId/retry",
  validate({ params: workflowIdParamSchema }),
  contract({
    operationId: "workflow_queue_retry",
    summary: "Retry failed or canceled workflow",
    auth: { type: "frontend_bearer_http" },
    request: { params: workflowIdParamSchema },
    responses: [
      {
        kind: "json",
        status: 201,
        data: typeRefExpr("{ originalWorkflowId: string; newWorkflowId?: string; workflow: WorkflowQueue }", ["WorkflowQueue"]),
      },
    ],
  }),
  workflowQueueController.retryWorkflow
);

export default router;

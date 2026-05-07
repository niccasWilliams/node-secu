import { Router } from "express";

import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { jobController } from "./job.controller";
import {
  jobErrorRawResponseSchema,
  jobExecuteBodySchema,
  jobExecuteRawResponseSchema,
  jobOverviewRawResponseSchema,
  jobsRunningRawResponseSchema,
  jobWorkersListRawResponseSchema,
  jobsListQuerySchema,
  jobsListRawResponseSchema,
} from "./job.dto";

const c = createContractRouter("/cron-jobs", { tags: ["jobs"] });
const router: Router = c.router;

router.use(AccessControl.isJob);

c.get(
  "/",
  validate({ query: jobsListQuerySchema }),
  contract({
    operationId: "jobs_list",
    summary: "List active jobs",
    description: "Returns all active cron jobs that can be executed by the job runner.",
    auth: { type: "cron_bearer_https" },
    request: { query: jobsListQuerySchema },
    responses: [
      { kind: "json_raw", status: 200, data: jobsListRawResponseSchema },
      { kind: "json_raw", status: 500, data: jobErrorRawResponseSchema },
    ],
  }),
  jobController.getJobs
);

c.get(
  "/workers",
  contract({
    operationId: "jobs_workers_list",
    summary: "List logical workers and their jobs",
    description: "Returns grouped worker lanes with mapped jobs, schedule, urgency and execution order.",
    auth: { type: "cron_bearer_https" },
    request: { query: jobsListQuerySchema },
    responses: [
      { kind: "json_raw", status: 200, data: jobWorkersListRawResponseSchema },
      { kind: "json_raw", status: 500, data: jobErrorRawResponseSchema },
    ],
  }),
  jobController.getWorkers
);

c.get(
  "/overview",
  validate({ query: jobsListQuerySchema }),
  contract({
    operationId: "jobs_overview",
    summary: "Get job overview metrics",
    description:
      "Returns enterprise overview counters grouped by worker/domain/urgency for monitoring and job-app dashboards.",
    auth: { type: "cron_bearer_https" },
    request: { query: jobsListQuerySchema },
    responses: [
      { kind: "json_raw", status: 200, data: jobOverviewRawResponseSchema },
      { kind: "json_raw", status: 500, data: jobErrorRawResponseSchema },
    ],
  }),
  jobController.getOverview
);

c.get(
  "/running",
  validate({ query: jobsListQuerySchema }),
  contract({
    operationId: "jobs_running_list",
    summary: "List currently running jobs",
    description:
      "Returns in-memory runtime executions currently being processed by this backend instance.",
    auth: { type: "cron_bearer_https" },
    request: { query: jobsListQuerySchema },
    responses: [
      { kind: "json_raw", status: 200, data: jobsRunningRawResponseSchema },
      { kind: "json_raw", status: 500, data: jobErrorRawResponseSchema },
    ],
  }),
  jobController.getRunning
);

c.post(
  "/",
  validate({ body: jobExecuteBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "jobs_execute",
    summary: "Execute one job",
    description: "Executes a single active job immediately by `jobId`.",
    auth: { type: "cron_bearer_https" },
    request: { body: jobExecuteBodySchema, bodyContentType: "application/json" },
    responses: [
      { kind: "json_raw", status: 200, data: jobExecuteRawResponseSchema },
      { kind: "json_raw", status: 400, data: jobErrorRawResponseSchema },
      { kind: "json_raw", status: 404, data: jobErrorRawResponseSchema },
      { kind: "json_raw", status: 409, data: jobErrorRawResponseSchema },
      { kind: "json_raw", status: 500, data: jobErrorRawResponseSchema },
    ],
  }),
  jobController.executeJob
);

export default router;

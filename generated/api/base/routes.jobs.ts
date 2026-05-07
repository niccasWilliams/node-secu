// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-04T18:32:46.347Z
// Run `pnpm run api:generate` to regenerate

export type JobsListParams = undefined;
export type JobsListQuery = {
  worker?: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  domain?: "maintenance" | "compliance" | "reporting";
  activeOnly?: boolean;
};
export type JobsListBody = undefined;
export type JobsListResponseData = {
  success: boolean;
  data: Array<{
  id: string;
  name: string;
  description: string;
  schedule: string;
  urgency: "low" | "medium" | "high" | "critical";
  domain: "maintenance" | "compliance" | "reporting";
  worker: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  runOrder: number;
  allowConcurrentRuns: boolean;
}>;
  count: number;
  generatedAt: string;
};
export type JobsListResponse = JobsListResponseData;

export type JobsWorkersListParams = undefined;
export type JobsWorkersListQuery = {
  worker?: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  domain?: "maintenance" | "compliance" | "reporting";
  activeOnly?: boolean;
};
export type JobsWorkersListBody = undefined;
export type JobsWorkersListResponseData = {
  success: boolean;
  data: Array<{
  worker: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  domain: "maintenance" | "compliance" | "reporting";
  name: string;
  description: string;
  jobs: Array<{
  id: string;
  name: string;
  schedule: string;
  urgency: "low" | "medium" | "high" | "critical";
  runOrder: number;
  active: boolean;
}>;
}>;
  count: number;
  generatedAt: string;
};
export type JobsWorkersListResponse = JobsWorkersListResponseData;

export type JobsOverviewParams = undefined;
export type JobsOverviewQuery = {
  worker?: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  domain?: "maintenance" | "compliance" | "reporting";
  activeOnly?: boolean;
};
export type JobsOverviewBody = undefined;
export type JobsOverviewResponseData = {
  success: boolean;
  data: {
  totalJobs: number;
  activeJobs: number;
  inactiveJobs: number;
  workers: Array<{
  worker: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  total: number;
  active: number;
  inactive: number;
}>;
  domains: Array<{
  domain: "maintenance" | "compliance" | "reporting";
  total: number;
  active: number;
  inactive: number;
}>;
  urgencies: Array<{
  urgency: "low" | "medium" | "high" | "critical";
  total: number;
}>;
};
  generatedAt: string;
};
export type JobsOverviewResponse = JobsOverviewResponseData;

export type JobsRunningListParams = undefined;
export type JobsRunningListQuery = {
  worker?: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  domain?: "maintenance" | "compliance" | "reporting";
  activeOnly?: boolean;
};
export type JobsRunningListBody = undefined;
export type JobsRunningListResponseData = {
  success: boolean;
  data: Array<{
  executionKey: string;
  jobId: string;
  runId: string | null;
  triggeredBy: string | null;
  requestedAt: string | null;
  startedAt: string;
  worker: "core-maintenance-worker" | "finance-compliance-worker" | "admin-reporting-worker";
  domain: "maintenance" | "compliance" | "reporting";
}>;
  count: number;
  generatedAt: string;
};
export type JobsRunningListResponse = JobsRunningListResponseData;

export type JobsExecuteParams = undefined;
export type JobsExecuteQuery = undefined;
export type JobsExecuteBody = {
  jobId: string;
  schedule?: string;
  payload?: any;
  meta?: {
  runId?: string;
  triggeredBy?: string;
  requestedAt?: string;
};
  _callback?: {
  url: string;
  runId: string;
  expectedSignatureHeader?: string;
};
};
export type JobsExecuteResponseData = {
  success: boolean;
  jobId: string;
  durationMs: number;
  executedAt: string;
  result: any | null;
};
export type JobsExecuteResponse = JobsExecuteResponseData;

export const apiRoutes_jobs = {
  "jobs_list": {
    method: "GET",
    path: "/cron-jobs",
    auth: {"type":"cron_bearer_https"},
    meta: {
      tags: ["jobs"],
      summary: "List active jobs",
      description: "Returns all active cron jobs that can be executed by the job runner.",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: JobsListParams;
      query: JobsListQuery;
      body: JobsListBody;
      response: JobsListResponse;
      responseData: JobsListResponseData;
    },
  },
  "jobs_workers_list": {
    method: "GET",
    path: "/cron-jobs/workers",
    auth: {"type":"cron_bearer_https"},
    meta: {
      tags: ["jobs"],
      summary: "List logical workers and their jobs",
      description: "Returns grouped worker lanes with mapped jobs, schedule, urgency and execution order.",
    },
    types: null as unknown as {
      params: JobsWorkersListParams;
      query: JobsWorkersListQuery;
      body: JobsWorkersListBody;
      response: JobsWorkersListResponse;
      responseData: JobsWorkersListResponseData;
    },
  },
  "jobs_overview": {
    method: "GET",
    path: "/cron-jobs/overview",
    auth: {"type":"cron_bearer_https"},
    meta: {
      tags: ["jobs"],
      summary: "Get job overview metrics",
      description: "Returns enterprise overview counters grouped by worker/domain/urgency for monitoring and job-app dashboards.",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: JobsOverviewParams;
      query: JobsOverviewQuery;
      body: JobsOverviewBody;
      response: JobsOverviewResponse;
      responseData: JobsOverviewResponseData;
    },
  },
  "jobs_running_list": {
    method: "GET",
    path: "/cron-jobs/running",
    auth: {"type":"cron_bearer_https"},
    meta: {
      tags: ["jobs"],
      summary: "List currently running jobs",
      description: "Returns in-memory runtime executions currently being processed by this backend instance.",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: JobsRunningListParams;
      query: JobsRunningListQuery;
      body: JobsRunningListBody;
      response: JobsRunningListResponse;
      responseData: JobsRunningListResponseData;
    },
  },
  "jobs_execute": {
    method: "POST",
    path: "/cron-jobs",
    auth: {"type":"cron_bearer_https"},
    meta: {
      tags: ["jobs"],
      summary: "Execute one job",
      description: "Executes a single active job immediately by `jobId`.",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: JobsExecuteParams;
      query: JobsExecuteQuery;
      body: JobsExecuteBody;
      response: JobsExecuteResponse;
      responseData: JobsExecuteResponseData;
    },
  },
} as const;
// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T21:09:35.390Z
// Run `pnpm run api:generate` to regenerate

export type SecuWorkerRegistryListParams = undefined;
export type SecuWorkerRegistryListQuery = {
  targetKind?: string;
  scope?: "passive_only" | "active_safe" | "active_intrusive";
};
export type SecuWorkerRegistryListBody = undefined;
export type SecuWorkerRegistryListResponseData = Array<{
  jobKey: string;
  requiredScope: "passive_only" | "active_safe" | "active_intrusive";
  description: string;
  defaultTimeoutMs: number;
}>;
export type SecuWorkerRegistryListResponse = import("../types").ApiEnvelope<SecuWorkerRegistryListResponseData>;

export type SecuWorkerRunStartParams = {
  id: number;
  workerKey: string;
};
export type SecuWorkerRunStartQuery = undefined;
export type SecuWorkerRunStartBody = {
  entityId: number;
  timeoutMs?: number;
  triggeredBy?: string;
};
export type SecuWorkerRunStartResponseData = {
  workerRunId: number;
  status: "pending" | "provisioning" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  findingsCreated: number;
  findingsDeduped: number;
  techCount: number;
  newDiscoveredEntities: number;
  discoveredEntityIds: Array<number>;
  durationMs: number;
  exitCode?: number | null;
  error?: string | null;
};
export type SecuWorkerRunStartResponse = import("../types").ApiEnvelope<SecuWorkerRunStartResponseData>;

export type SecuWorkerRunListParams = {
  id: number;
};
export type SecuWorkerRunListQuery = {
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "startedAt" | "finishedAt" | "status" | "durationMs";
  order?: "asc" | "desc";
  search?: string;
  workerKey?: string;
  status?: "pending" | "provisioning" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  entityId?: number;
};
export type SecuWorkerRunListBody = undefined;
export type SecuWorkerRunListResponseData = Array<{
  id: number;
  playbookRunId: number | null;
  engagementId: number;
  entityId: number | null;
  workerKey: string;
  status: "pending" | "provisioning" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  provider: "local" | "hetzner" | "aws" | "digitalocean" | "docker_host" | "tor_proxy";
  providerInstanceId: string | null;
  providerRegion: string | null;
  logsRef: string | null;
  exitCode: number | null;
  error: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}>;
export type SecuWorkerRunListResponse = import("../types").ApiEnvelope<SecuWorkerRunListResponseData>;

export type SecuWorkerRunGetParams = {
  id: number;
  runId: number;
};
export type SecuWorkerRunGetQuery = undefined;
export type SecuWorkerRunGetBody = undefined;
export type SecuWorkerRunGetResponseData = {
  id: number;
  playbookRunId: number | null;
  engagementId: number;
  entityId: number | null;
  workerKey: string;
  status: "pending" | "provisioning" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  provider: "local" | "hetzner" | "aws" | "digitalocean" | "docker_host" | "tor_proxy";
  providerInstanceId: string | null;
  providerRegion: string | null;
  logsRef: string | null;
  exitCode: number | null;
  error: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};
export type SecuWorkerRunGetResponse = import("../types").ApiEnvelope<SecuWorkerRunGetResponseData>;

export const apiRoutes_secu_workers = {
  "secu_worker_registry_list": {
    method: "GET",
    path: "/workers",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-workers"],
      summary: "List all registered workers (registry view) — optionally filtered by scope/targetKind",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuWorkerRegistryListParams;
      query: SecuWorkerRegistryListQuery;
      body: SecuWorkerRegistryListBody;
      response: SecuWorkerRegistryListResponse;
      responseData: SecuWorkerRegistryListResponseData;
    },
  },
  "secu_worker_run_start": {
    method: "POST",
    path: "/engagements/:id/workers/:workerKey/run",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-workers"],
      summary: "Trigger a single worker against one entity (ad-hoc; no playbook). Synchronously executes and returns the persisted worker_run summary.",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuWorkerRunStartParams;
      query: SecuWorkerRunStartQuery;
      body: SecuWorkerRunStartBody;
      response: SecuWorkerRunStartResponse;
      responseData: SecuWorkerRunStartResponseData;
    },
  },
  "secu_worker_run_list": {
    method: "GET",
    path: "/engagements/:id/workers/runs",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-workers"],
      summary: "List worker runs for an engagement (filterable by workerKey/status/entityId)",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuWorkerRunListParams;
      query: SecuWorkerRunListQuery;
      body: SecuWorkerRunListBody;
      response: SecuWorkerRunListResponse;
      responseData: SecuWorkerRunListResponseData;
    },
  },
  "secu_worker_run_get": {
    method: "GET",
    path: "/engagements/:id/workers/runs/:runId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-workers"],
      summary: "Get a single worker run incl. exit_code, findings, error",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuWorkerRunGetParams;
      query: SecuWorkerRunGetQuery;
      body: SecuWorkerRunGetBody;
      response: SecuWorkerRunGetResponse;
      responseData: SecuWorkerRunGetResponseData;
    },
  },
} as const;
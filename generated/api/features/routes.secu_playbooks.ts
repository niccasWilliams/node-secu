// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T21:09:35.389Z
// Run `pnpm run api:generate` to regenerate

export type SecuPlaybookRegistryListParams = undefined;
export type SecuPlaybookRegistryListQuery = undefined;
export type SecuPlaybookRegistryListBody = undefined;
export type SecuPlaybookRegistryListResponseData = Array<{
  key: string;
  label: string;
  description: string;
  acceptsRootEntityKinds: Array<"asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider">;
  maxRequiredScope: "passive_only" | "active_safe" | "active_intrusive";
  steps: Array<{
  key: string;
  label: string;
  workerKey: string;
  dependsOn: Array<string>;
  hasCondition: boolean;
}>;
}>;
export type SecuPlaybookRegistryListResponse = import("../types").ApiEnvelope<SecuPlaybookRegistryListResponseData>;

export type SecuPlaybookRunStartParams = {
  id: number;
  playbookKey: "web_recon_passive" | "web_recon_active" | "osint_email_passive" | "osint_username_passive" | "osint_organization_recon" | "osint_pivot_light" | "osint_github_account_recon" | "api_security_active";
};
export type SecuPlaybookRunStartQuery = undefined;
export type SecuPlaybookRunStartBody = {
  rootEntityId: number;
  params?: Record<string, any>;
  triggeredBy?: string;
};
export type SecuPlaybookRunStartResponseData = {
  runId: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  playbook: {
  key: string;
  label: string;
};
};
export type SecuPlaybookRunStartResponse = import("../types").ApiEnvelope<SecuPlaybookRunStartResponseData>;

export type SecuPlaybookRunListParams = {
  id: number;
};
export type SecuPlaybookRunListQuery = {
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "startedAt" | "finishedAt" | "status";
  order?: "asc" | "desc";
  search?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  playbookKey?: "web_recon_passive" | "web_recon_active" | "osint_email_passive" | "osint_username_passive" | "osint_organization_recon" | "osint_pivot_light" | "osint_github_account_recon" | "api_security_active";
};
export type SecuPlaybookRunListBody = undefined;
export type SecuPlaybookRunListResponseData = Array<{
  id: number;
  engagementId: number;
  playbookKey: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  triggeredBy: string;
  triggeredByUserId: number | null;
  params: Record<string, any>;
  resultSummary: Record<string, any>;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  hopDepth: number;
  parentRunId: number | null;
}>;
export type SecuPlaybookRunListResponse = import("../types").ApiEnvelope<SecuPlaybookRunListResponseData>;

export type SecuPlaybookRunGetParams = {
  id: number;
  runId: number;
};
export type SecuPlaybookRunGetQuery = undefined;
export type SecuPlaybookRunGetBody = undefined;
export type SecuPlaybookRunGetResponseData = {
  run: {
  id: number;
  engagementId: number;
  playbookKey: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  triggeredBy: string;
  triggeredByUserId: number | null;
  params: Record<string, any>;
  resultSummary: Record<string, any>;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  hopDepth: number;
  parentRunId: number | null;
};
  workerRuns: Array<{
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
  summary: {
  playbookKey: string;
  rootEntityId: number;
  steps: Array<{
  stepKey: string;
  workerKey: string;
  runs: Array<{
  targetEntityId: number;
  targetValue: string;
  status: "pending" | "provisioning" | "running" | "completed" | "failed" | "cancelled" | "skipped";
  findingsCreated: number;
  findingsDeduped?: number;
  techDiscovered: number;
  discoveredEntities: number;
  error?: string;
  workerRunId?: number;
}>;
}>;
  totalFindingsCreated: number;
  totalFindingsDeduped: number;
  totalDiscoveredEntities: number;
  totalWorkerRuns?: number;
  successfulWorkerRuns?: number;
} | null;
};
export type SecuPlaybookRunGetResponse = import("../types").ApiEnvelope<SecuPlaybookRunGetResponseData>;

export type SecuPlaybookRunStatusParams = {
  id: number;
  runId: number;
};
export type SecuPlaybookRunStatusQuery = undefined;
export type SecuPlaybookRunStatusBody = undefined;
export type SecuPlaybookRunStatusResponseData = {
  runId: number;
  engagementId: number;
  playbookKey: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  workerRuns: {
  total: number;
  pending: number;
  provisioning: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  skipped: number;
};
  findingsCreated: number;
  findingsDeduped: number;
  discoveredEntities: number;
  etag: string;
};
export type SecuPlaybookRunStatusResponse = import("../types").ApiEnvelope<SecuPlaybookRunStatusResponseData>;

export type SecuPlaybookRunEventsParams = {
  id: number;
  runId: number;
};
export type SecuPlaybookRunEventsQuery = undefined;
export type SecuPlaybookRunEventsBody = undefined;
export type SecuPlaybookRunEventsResponseData = Blob;
export type SecuPlaybookRunEventsResponse = Blob;

export const apiRoutes_secu_playbooks = {
  "secu_playbook_registry_list": {
    method: "GET",
    path: "/playbooks",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "List all registered playbooks (registry view)",
    },
    types: null as unknown as {
      params: SecuPlaybookRegistryListParams;
      query: SecuPlaybookRegistryListQuery;
      body: SecuPlaybookRegistryListBody;
      response: SecuPlaybookRegistryListResponse;
      responseData: SecuPlaybookRegistryListResponseData;
    },
  },
  "secu_playbook_run_start": {
    method: "POST",
    path: "/engagements/:id/playbooks/:playbookKey",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "Start a playbook run for an engagement (background-executed; returns 202 immediately)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuPlaybookRunStartParams;
      query: SecuPlaybookRunStartQuery;
      body: SecuPlaybookRunStartBody;
      response: SecuPlaybookRunStartResponse;
      responseData: SecuPlaybookRunStartResponseData;
    },
  },
  "secu_playbook_run_list": {
    method: "GET",
    path: "/engagements/:id/playbooks/runs",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "List playbook runs for an engagement (paginated, filterable by status/playbookKey)",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuPlaybookRunListParams;
      query: SecuPlaybookRunListQuery;
      body: SecuPlaybookRunListBody;
      response: SecuPlaybookRunListResponse;
      responseData: SecuPlaybookRunListResponseData;
    },
  },
  "secu_playbook_run_get": {
    method: "GET",
    path: "/engagements/:id/playbooks/runs/:runId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "Get a single playbook run incl. step summary + worker_runs",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuPlaybookRunGetParams;
      query: SecuPlaybookRunGetQuery;
      body: SecuPlaybookRunGetBody;
      response: SecuPlaybookRunGetResponse;
      responseData: SecuPlaybookRunGetResponseData;
    },
  },
  "secu_playbook_run_status": {
    method: "GET",
    path: "/engagements/:id/playbooks/runs/:runId/status",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "Lean playbook run status for polling; sends ETag and supports If-None-Match",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuPlaybookRunStatusParams;
      query: SecuPlaybookRunStatusQuery;
      body: SecuPlaybookRunStatusBody;
      response: SecuPlaybookRunStatusResponse;
      responseData: SecuPlaybookRunStatusResponseData;
    },
  },
  "secu_playbook_run_events": {
    method: "GET",
    path: "/engagements/:id/playbooks/runs/:runId/events",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "Server-Sent Events stream for playbook run status changes",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuPlaybookRunEventsParams;
      query: SecuPlaybookRunEventsQuery;
      body: SecuPlaybookRunEventsBody;
      response: SecuPlaybookRunEventsResponse;
      responseData: SecuPlaybookRunEventsResponseData;
    },
  },
} as const;
// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T23:56:25.849Z
// Run `pnpm run api:generate` to regenerate

export type SecuGraphAggregateParams = undefined;
export type SecuGraphAggregateQuery = {
  engagements?: string;
  dedupe?: "canonicalKey" | "none";
  kinds?: string;
  severity?: string;
  since?: string;
  nodeLimit?: number;
};
export type SecuGraphAggregateBody = undefined;
export type SecuGraphAggregateResponseData = {
  nodes: Array<{
  data: {
  id: string;
  canonicalKey: string;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  engagementIds: Array<number>;
  entityIds: Array<number>;
  findingsBySeverity: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};
  lastSeenAt: string;
  data: Record<string, any>;
};
}>;
  edges: Array<{
  data: {
  id: string;
  source: string;
  target: string;
  kind: string;
  engagementIds: Array<number>;
};
}>;
  meta: {
  engagementCount: number;
  nodeCount: number;
  edgeCount: number;
  truncated: boolean;
  generatedAt: string;
};
};
export type SecuGraphAggregateResponse = import("../types").ApiEnvelope<SecuGraphAggregateResponseData>;

export type SecuActivityFeedParams = undefined;
export type SecuActivityFeedQuery = {
  since?: string;
  until?: string;
  engagements?: string;
  kinds?: string;
  limit?: number;
  cursor?: string;
};
export type SecuActivityFeedBody = undefined;
export type SecuActivityFeedResponseData = {
  events: Array<{
  id: string;
  kind: "worker_run" | "finding" | "signal_chain" | "engagement_status" | "playbook_run";
  engagementId: number | null;
  engagementName: string | null;
  occurredAt: string;
  severity?: "critical" | "high" | "medium" | "low" | "info";
  payload: Record<string, any>;
}>;
  nextCursor: string | null;
  meta: {
  totalApproximate: number;
  sinceCovered: string | null;
};
};
export type SecuActivityFeedResponse = import("../types").ApiEnvelope<SecuActivityFeedResponseData>;

export type SecuFindingsGlobalParams = undefined;
export type SecuFindingsGlobalQuery = {
  engagements?: string;
  severity?: string;
  status?: string;
  category?: string;
  triageReason?: string;
  workerKey?: string;
  entityId?: number;
  discoveredSince?: string;
  limit?: number;
  cursor?: string;
};
export type SecuFindingsGlobalBody = undefined;
export type SecuFindingsGlobalResponseData = {
  findings: Array<{
  id: number;
  engagementId: number;
  entityId: number | null;
  workerRunId: number | null;
  fingerprint: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "dns" | "email_security" | "tls" | "http_headers" | "exposure" | "cms" | "auth" | "injection" | "cve" | "config" | "deps" | "cert" | "phishing" | "leak" | "compliance_imprint";
  status: "open" | "triaged" | "confirmed" | "false_positive" | "wont_fix" | "fixed";
  title: string;
  description: string;
  rawData: Record<string, any>;
  recommendation: string | null;
  cveIds: Array<string>;
  cvssScore: string | null;
  triageReason: "irrelevant_legacy" | "compensating_control" | "accepted_risk" | "duplicate" | "manual_review_pending" | "customer_approved" | "scoping_excluded" | "other" | null;
  triageNote: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedBy: number | null;
  discoveredAt: string;
  entity: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
} | null;
  workerRun: {
  id: number;
  workerKey: string;
  status: "pending" | "provisioning" | "running" | "completed" | "failed" | "cancelled" | "skipped";
} | null;
  engagementName: string;
  entityDisplayName: string | null;
}>;
  nextCursor: string | null;
  aggregations: {
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
};
};
export type SecuFindingsGlobalResponse = import("../types").ApiEnvelope<SecuFindingsGlobalResponseData>;

export type SecuWorkerRunsGlobalParams = undefined;
export type SecuWorkerRunsGlobalQuery = {
  engagements?: string;
  status?: string;
  workerKey?: string;
  since?: string;
  limit?: number;
  cursor?: string;
};
export type SecuWorkerRunsGlobalBody = undefined;
export type SecuWorkerRunsGlobalResponseData = {
  runs: Array<{
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
  engagementName: string;
  entityDisplayName: string | null;
}>;
  nextCursor: string | null;
  meta: {
  runningCount: number;
  pendingCount: number;
};
};
export type SecuWorkerRunsGlobalResponse = import("../types").ApiEnvelope<SecuWorkerRunsGlobalResponseData>;

export const apiRoutes_secu_global = {
  "secu_graph_aggregate": {
    method: "GET",
    path: "/graph/aggregate",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-global"],
      summary: "Cross-Engagement-Aggregat-Graph (canonicalKey-Dedup, Severity-Heatmap, 2000-Node-Cap)",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuGraphAggregateParams;
      query: SecuGraphAggregateQuery;
      body: SecuGraphAggregateBody;
      response: SecuGraphAggregateResponse;
      responseData: SecuGraphAggregateResponseData;
    },
  },
  "secu_activity_feed": {
    method: "GET",
    path: "/activity",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-global"],
      summary: "Cross-Engagement Activity-Feed (worker_runs / findings / signal_chains / playbook_runs / status)",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuActivityFeedParams;
      query: SecuActivityFeedQuery;
      body: SecuActivityFeedBody;
      response: SecuActivityFeedResponse;
      responseData: SecuActivityFeedResponseData;
    },
  },
  "secu_findings_global": {
    method: "GET",
    path: "/findings",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-global"],
      summary: "Globale Findings-Inbox über alle Engagements (mit aggregations bySeverity/byStatus/byCategory)",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuFindingsGlobalParams;
      query: SecuFindingsGlobalQuery;
      body: SecuFindingsGlobalBody;
      response: SecuFindingsGlobalResponse;
      responseData: SecuFindingsGlobalResponseData;
    },
  },
  "secu_worker_runs_global": {
    method: "GET",
    path: "/workers/runs",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-global"],
      summary: "Globale Worker-Run-History inkl. running/pending Counter für Live-Status",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuWorkerRunsGlobalParams;
      query: SecuWorkerRunsGlobalQuery;
      body: SecuWorkerRunsGlobalBody;
      response: SecuWorkerRunsGlobalResponse;
      responseData: SecuWorkerRunsGlobalResponseData;
    },
  },
} as const;
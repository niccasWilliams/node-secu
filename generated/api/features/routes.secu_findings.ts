// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T21:27:24.258Z
// Run `pnpm run api:generate` to regenerate

export type SecuFindingListParams = {
  id: number;
};
export type SecuFindingListQuery = {
  limit?: number;
  offset?: number;
  sortBy?: "discoveredAt" | "severity" | "status" | "category";
  order?: "asc" | "desc";
  search?: string;
  severity?: "critical" | "high" | "medium" | "low" | "info";
  status?: "open" | "triaged" | "confirmed" | "false_positive" | "wont_fix" | "fixed";
  triageReason?: "irrelevant_legacy" | "compensating_control" | "accepted_risk" | "duplicate" | "manual_review_pending" | "customer_approved" | "scoping_excluded" | "other";
  category?: "dns" | "email_security" | "tls" | "http_headers" | "exposure" | "cms" | "auth" | "injection" | "cve" | "config" | "deps" | "cert" | "phishing" | "leak" | "compliance_imprint";
  workerKey?: string;
  entityId?: number;
};
export type SecuFindingListBody = undefined;
export type SecuFindingListResponseData = Array<{
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
}>;
export type SecuFindingListResponse = import("../types").ApiEnvelope<SecuFindingListResponseData>;

export type SecuFindingGetParams = {
  id: number;
  findingId: number;
};
export type SecuFindingGetQuery = undefined;
export type SecuFindingGetBody = undefined;
export type SecuFindingGetResponseData = {
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
};
export type SecuFindingGetResponse = import("../types").ApiEnvelope<SecuFindingGetResponseData>;

export type SecuFindingPatchParams = {
  id: number;
  findingId: number;
};
export type SecuFindingPatchQuery = undefined;
export type SecuFindingPatchBody = {
  status: "open" | "triaged" | "confirmed" | "false_positive" | "wont_fix" | "fixed";
  triageReason?: "irrelevant_legacy" | "compensating_control" | "accepted_risk" | "duplicate" | "manual_review_pending" | "customer_approved" | "scoping_excluded" | "other" | null;
  triageNote?: string | null;
  resolutionNote?: string | null;
};
export type SecuFindingPatchResponseData = {
  finding: {
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
};
};
export type SecuFindingPatchResponse = import("../types").ApiEnvelope<SecuFindingPatchResponseData>;

export type SecuFindingCommentsListParams = {
  id: number;
  findingId: number;
};
export type SecuFindingCommentsListQuery = undefined;
export type SecuFindingCommentsListBody = undefined;
export type SecuFindingCommentsListResponseData = Array<{
  id: number;
  findingId: number;
  userId: number | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  author: {
  id: number;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
} | null;
}>;
export type SecuFindingCommentsListResponse = import("../types").ApiEnvelope<SecuFindingCommentsListResponseData>;

export type SecuFindingCommentCreateParams = {
  id: number;
  findingId: number;
};
export type SecuFindingCommentCreateQuery = undefined;
export type SecuFindingCommentCreateBody = {
  body: string;
};
export type SecuFindingCommentCreateResponseData = {
  id: number;
  findingId: number;
  userId: number | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
};
export type SecuFindingCommentCreateResponse = import("../types").ApiEnvelope<SecuFindingCommentCreateResponseData>;

export type SecuFindingCommentDeleteParams = {
  id: number;
  findingId: number;
  commentId: number;
};
export type SecuFindingCommentDeleteQuery = undefined;
export type SecuFindingCommentDeleteBody = undefined;
export type SecuFindingCommentDeleteResponseData = null;
export type SecuFindingCommentDeleteResponse = import("../types").ApiEnvelope<SecuFindingCommentDeleteResponseData>;

export const apiRoutes_secu_findings = {
  "secu_finding_list": {
    method: "GET",
    path: "/engagements/:id/findings",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-findings"],
      summary: "List findings for an engagement (filterable + paginated; supports triage filter)",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuFindingListParams;
      query: SecuFindingListQuery;
      body: SecuFindingListBody;
      response: SecuFindingListResponse;
      responseData: SecuFindingListResponseData;
    },
  },
  "secu_finding_get": {
    method: "GET",
    path: "/engagements/:id/findings/:findingId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-findings"],
      summary: "Get one finding with entity and worker context",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuFindingGetParams;
      query: SecuFindingGetQuery;
      body: SecuFindingGetBody;
      response: SecuFindingGetResponse;
      responseData: SecuFindingGetResponseData;
    },
  },
  "secu_finding_patch": {
    method: "PATCH",
    path: "/engagements/:id/findings/:findingId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-findings"],
      summary: "Update finding triage (status + optional reason/note/resolution-note)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuFindingPatchParams;
      query: SecuFindingPatchQuery;
      body: SecuFindingPatchBody;
      response: SecuFindingPatchResponse;
      responseData: SecuFindingPatchResponseData;
    },
  },
  "secu_finding_comments_list": {
    method: "GET",
    path: "/engagements/:id/findings/:findingId/comments",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-findings"],
      summary: "List operator comments on a finding (chronological)",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuFindingCommentsListParams;
      query: SecuFindingCommentsListQuery;
      body: SecuFindingCommentsListBody;
      response: SecuFindingCommentsListResponse;
      responseData: SecuFindingCommentsListResponseData;
    },
  },
  "secu_finding_comment_create": {
    method: "POST",
    path: "/engagements/:id/findings/:findingId/comments",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-findings"],
      summary: "Add an operator comment to a finding",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuFindingCommentCreateParams;
      query: SecuFindingCommentCreateQuery;
      body: SecuFindingCommentCreateBody;
      response: SecuFindingCommentCreateResponse;
      responseData: SecuFindingCommentCreateResponseData;
    },
  },
  "secu_finding_comment_delete": {
    method: "DELETE",
    path: "/engagements/:id/findings/:findingId/comments/:commentId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-findings"],
      summary: "Delete a comment on a finding",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuFindingCommentDeleteParams;
      query: SecuFindingCommentDeleteQuery;
      body: SecuFindingCommentDeleteBody;
      response: SecuFindingCommentDeleteResponse;
      responseData: SecuFindingCommentDeleteResponseData;
    },
  },
} as const;
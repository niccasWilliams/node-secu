// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T23:56:25.848Z
// Run `pnpm run api:generate` to regenerate

export type SecuEntityUpsertParams = undefined;
export type SecuEntityUpsertQuery = undefined;
export type SecuEntityUpsertBody = {
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  primaryValue: string;
  displayName?: string;
  discriminator?: string | null;
  data?: Record<string, any>;
};
export type SecuEntityUpsertResponseData = {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
export type SecuEntityUpsertResponse = import("../types").ApiEnvelope<SecuEntityUpsertResponseData>;

export type SecuEntitySearchParams = undefined;
export type SecuEntitySearchQuery = {
  limit?: number;
  offset?: number;
  sortBy?: "firstSeenAt" | "lastSeenAt" | "displayName" | "kind";
  order?: "asc" | "desc";
  search?: string;
  kind?: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  q?: string;
  includeSpeculative?: boolean;
};
export type SecuEntitySearchBody = undefined;
export type SecuEntitySearchResponseData = Array<{
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
  engagementCount: number;
  tags: Array<string>;
}>;
export type SecuEntitySearchResponse = import("../types").ApiEnvelope<SecuEntitySearchResponseData>;

export type SecuEntityGetParams = {
  id: number;
};
export type SecuEntityGetQuery = {
  engagementContext?: number;
  findingsLimit?: number;
  workerRunsLimit?: number;
  relatedLimit?: number;
};
export type SecuEntityGetBody = undefined;
export type SecuEntityGetResponseData = {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
  tags: Array<string>;
  engagements: Array<{
  engagementId: number;
  role: string | null;
  notes: string | null;
}>;
  relationshipCount: number;
  engagementsDetailed: Array<{
  engagementId: number;
  engagementName: string;
  engagementStatus: "planning" | "active" | "paused" | "completed" | "archived";
  role: "primary_target" | "in_scope" | "out_of_scope" | "pivot" | "context" | null;
  notes: string | null;
  addedAt: string;
}>;
  findings: {
  items: Array<{
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
}>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
};
  workerRuns: {
  items: Array<{
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
  countByStatus: Record<string, number>;
  lastSuccessfulAt: string | null;
  total: number;
};
  authorizations: Array<{
  id: number;
  entityId: number;
  kind: "own" | "verified_ownership" | "written_consent" | "internal_lab";
  scope: "passive_only" | "active_safe" | "active_intrusive";
  proofType: "dns_txt" | "http_file" | "written_contract" | "manual_owner_verification" | "none";
  proofRef: string | null;
  verificationToken: string | null;
  grantedBy: number | null;
  grantedAt: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: number | null;
  notes: string | null;
  createdAt: string;
}>;
  relatedEntities: Array<{
  id: number;
  canonicalKey: string;
  displayName: string;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  relationKind: string;
  relationshipId: number;
}>;
};
export type SecuEntityGetResponse = import("../types").ApiEnvelope<SecuEntityGetResponseData>;

export type SecuEntityRelationshipsListParams = {
  id: number;
};
export type SecuEntityRelationshipsListQuery = undefined;
export type SecuEntityRelationshipsListBody = undefined;
export type SecuEntityRelationshipsListResponseData = Array<{
  id: number;
  fromEntityId: number;
  toEntityId: number;
  kind: string;
  data: Record<string, any>;
  confidence: number;
  source: string;
  firstObservedAt: string;
  lastObservedAt: string;
  fromEntity?: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
  toEntity?: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
}>;
export type SecuEntityRelationshipsListResponse = import("../types").ApiEnvelope<SecuEntityRelationshipsListResponseData>;

export type SecuEntityRelationshipUpsertParams = {
  id: number;
};
export type SecuEntityRelationshipUpsertQuery = undefined;
export type SecuEntityRelationshipUpsertBody = {
  toEntityId: number;
  kind: string;
  confidence?: number;
  source?: string;
  data?: Record<string, any>;
};
export type SecuEntityRelationshipUpsertResponseData = {
  id: number;
  fromEntityId: number;
  toEntityId: number;
  kind: string;
  data: Record<string, any>;
  confidence: number;
  source: string;
  firstObservedAt: string;
  lastObservedAt: string;
};
export type SecuEntityRelationshipUpsertResponse = import("../types").ApiEnvelope<SecuEntityRelationshipUpsertResponseData>;

export type SecuEntityTagAddParams = {
  id: number;
};
export type SecuEntityTagAddQuery = undefined;
export type SecuEntityTagAddBody = {
  tag: string;
  color?: string | null;
};
export type SecuEntityTagAddResponseData = {
  tag: string;
};
export type SecuEntityTagAddResponse = import("../types").ApiEnvelope<SecuEntityTagAddResponseData>;

export type SecuEntityPatchParams = {
  id: number;
};
export type SecuEntityPatchQuery = undefined;
export type SecuEntityPatchBody = {
  displayName?: string;
  data?: Record<string, any>;
};
export type SecuEntityPatchResponseData = {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
export type SecuEntityPatchResponse = import("../types").ApiEnvelope<SecuEntityPatchResponseData>;

export type SecuEntityEnrichFullParams = {
  id: number;
};
export type SecuEntityEnrichFullQuery = undefined;
export type SecuEntityEnrichFullBody = {
  engagementId: number;
};
export type SecuEntityEnrichFullResponseData = {
  signalChainLogId: number;
  subPlaybookRuns: Array<{
  identityEntityId: number;
  playbookKey: string;
  runId: number;
}>;
};
export type SecuEntityEnrichFullResponse = import("../types").ApiEnvelope<SecuEntityEnrichFullResponseData>;

export const apiRoutes_secu_entities = {
  "secu_entity_upsert": {
    method: "POST",
    path: "/entities",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "Create or upsert a global entity (deduplicated via canonical_key)",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEntityUpsertParams;
      query: SecuEntityUpsertQuery;
      body: SecuEntityUpsertBody;
      response: SecuEntityUpsertResponse;
      responseData: SecuEntityUpsertResponseData;
    },
  },
  "secu_entity_search": {
    method: "GET",
    path: "/entities",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "Search global entities (kind + free text)",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuEntitySearchParams;
      query: SecuEntitySearchQuery;
      body: SecuEntitySearchBody;
      response: SecuEntitySearchResponse;
      responseData: SecuEntitySearchResponseData;
    },
  },
  "secu_entity_get": {
    method: "GET",
    path: "/entities/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "Get entity detail bundle: tags, engagements (detailed), findings + bySeverity/byStatus, worker_runs + countByStatus + lastSuccessfulAt, authorizations, related entities. Optional ?engagementContext=:id schränkt findings/runs auf ein Engagement ein.",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuEntityGetParams;
      query: SecuEntityGetQuery;
      body: SecuEntityGetBody;
      response: SecuEntityGetResponse;
      responseData: SecuEntityGetResponseData;
    },
  },
  "secu_entity_relationships_list": {
    method: "GET",
    path: "/entities/:id/relationships",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "List relationships incident to an entity",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEntityRelationshipsListParams;
      query: SecuEntityRelationshipsListQuery;
      body: SecuEntityRelationshipsListBody;
      response: SecuEntityRelationshipsListResponse;
      responseData: SecuEntityRelationshipsListResponseData;
    },
  },
  "secu_entity_relationship_upsert": {
    method: "POST",
    path: "/entities/:id/relationships",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "Upsert a relationship from this entity to another",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEntityRelationshipUpsertParams;
      query: SecuEntityRelationshipUpsertQuery;
      body: SecuEntityRelationshipUpsertBody;
      response: SecuEntityRelationshipUpsertResponse;
      responseData: SecuEntityRelationshipUpsertResponseData;
    },
  },
  "secu_entity_tag_add": {
    method: "POST",
    path: "/entities/:id/tags",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "Add a tag to an entity (idempotent)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEntityTagAddParams;
      query: SecuEntityTagAddQuery;
      body: SecuEntityTagAddBody;
      response: SecuEntityTagAddResponse;
      responseData: SecuEntityTagAddResponseData;
    },
  },
  "secu_entity_patch": {
    method: "PATCH",
    path: "/entities/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "Operator-edit an entity: merge data, optional displayName-update",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEntityPatchParams;
      query: SecuEntityPatchQuery;
      body: SecuEntityPatchBody;
      response: SecuEntityPatchResponse;
      responseData: SecuEntityPatchResponseData;
    },
  },
  "secu_entity_enrich_full": {
    method: "POST",
    path: "/entities/:id/enrich/full",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-entities"],
      summary: "Phase 2.7 — Trigger osint_person_full: load linked identities, run their playbooks, persist signal_chain_log",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEntityEnrichFullParams;
      query: SecuEntityEnrichFullQuery;
      body: SecuEntityEnrichFullBody;
      response: SecuEntityEnrichFullResponse;
      responseData: SecuEntityEnrichFullResponseData;
    },
  },
} as const;
// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T21:09:35.385Z
// Run `pnpm run api:generate` to regenerate

export type SecuEngagementCreateParams = undefined;
export type SecuEngagementCreateQuery = undefined;
export type SecuEngagementCreateBody = {
  name: string;
  kind: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  status?: "planning" | "active" | "paused" | "completed" | "archived";
  scopeSummary?: string;
  primaryDomain?: string;
};
export type SecuEngagementCreateResponseData = {
  engagement: {
  id: number;
  name: string;
  slug: string;
  kind: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  status: "planning" | "active" | "paused" | "completed" | "archived";
  ownerUserId: number | null;
  scopeSummary: string | null;
  osintBudgetPerHour: number;
  osintMaxHops: number;
  createdAt: string;
  updatedAt: string | null;
  archivedAt: string | null;
};
  primaryEntity?: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
};
export type SecuEngagementCreateResponse = import("../types").ApiEnvelope<SecuEngagementCreateResponseData>;

export type SecuEngagementListParams = undefined;
export type SecuEngagementListQuery = {
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "updatedAt" | "name" | "status";
  order?: "asc" | "desc";
  search?: string;
  includeArchived?: boolean;
  kind?: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  ownerUserId?: number;
};
export type SecuEngagementListBody = undefined;
export type SecuEngagementListResponseData = Array<{
  id: number;
  name: string;
  slug: string;
  kind: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  status: "planning" | "active" | "paused" | "completed" | "archived";
  ownerUserId: number | null;
  scopeSummary: string | null;
  osintBudgetPerHour: number;
  osintMaxHops: number;
  createdAt: string;
  updatedAt: string | null;
  archivedAt: string | null;
}>;
export type SecuEngagementListResponse = import("../types").ApiEnvelope<SecuEngagementListResponseData>;

export type SecuEngagementGetParams = {
  id: number;
};
export type SecuEngagementGetQuery = undefined;
export type SecuEngagementGetBody = undefined;
export type SecuEngagementGetResponseData = {
  id: number;
  name: string;
  slug: string;
  kind: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  status: "planning" | "active" | "paused" | "completed" | "archived";
  ownerUserId: number | null;
  scopeSummary: string | null;
  osintBudgetPerHour: number;
  osintMaxHops: number;
  createdAt: string;
  updatedAt: string | null;
  archivedAt: string | null;
  graph: {
  engagementId: number;
  nodes: Array<{
  data: {
  id: string;
  label: string;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  entityId: number;
  role: "primary_target" | "in_scope" | "out_of_scope" | "pivot" | "context" | null;
  tags: Array<string>;
};
}>;
  edges: Array<{
  data: {
  id: string;
  source: string;
  target: string;
  kind: string;
  confidence: number;
};
}>;
};
  entityCount: number;
  findingCount: number;
};
export type SecuEngagementGetResponse = import("../types").ApiEnvelope<SecuEngagementGetResponseData>;

export type SecuEngagementUpdateParams = {
  id: number;
};
export type SecuEngagementUpdateQuery = undefined;
export type SecuEngagementUpdateBody = {
  name?: string;
  status?: "planning" | "active" | "paused" | "completed" | "archived";
  scopeSummary?: string | null;
};
export type SecuEngagementUpdateResponseData = {
  id: number;
  name: string;
  slug: string;
  kind: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  status: "planning" | "active" | "paused" | "completed" | "archived";
  ownerUserId: number | null;
  scopeSummary: string | null;
  osintBudgetPerHour: number;
  osintMaxHops: number;
  createdAt: string;
  updatedAt: string | null;
  archivedAt: string | null;
};
export type SecuEngagementUpdateResponse = import("../types").ApiEnvelope<SecuEngagementUpdateResponseData>;

export type SecuEngagementArchiveParams = {
  id: number;
};
export type SecuEngagementArchiveQuery = undefined;
export type SecuEngagementArchiveBody = undefined;
export type SecuEngagementArchiveResponseData = {
  id: number;
  name: string;
  slug: string;
  kind: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  status: "planning" | "active" | "paused" | "completed" | "archived";
  ownerUserId: number | null;
  scopeSummary: string | null;
  osintBudgetPerHour: number;
  osintMaxHops: number;
  createdAt: string;
  updatedAt: string | null;
  archivedAt: string | null;
};
export type SecuEngagementArchiveResponse = import("../types").ApiEnvelope<SecuEngagementArchiveResponseData>;

export type SecuEngagementGraphParams = {
  id: number;
};
export type SecuEngagementGraphQuery = undefined;
export type SecuEngagementGraphBody = undefined;
export type SecuEngagementGraphResponseData = {
  engagementId: number;
  nodes: Array<{
  data: {
  id: string;
  label: string;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  entityId: number;
  role: "primary_target" | "in_scope" | "out_of_scope" | "pivot" | "context" | null;
  tags: Array<string>;
};
}>;
  edges: Array<{
  data: {
  id: string;
  source: string;
  target: string;
  kind: string;
  confidence: number;
};
}>;
};
export type SecuEngagementGraphResponse = import("../types").ApiEnvelope<SecuEngagementGraphResponseData>;

export type SecuEngagementEntitiesListParams = {
  id: number;
};
export type SecuEngagementEntitiesListQuery = {
  kind?: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
};
export type SecuEngagementEntitiesListBody = undefined;
export type SecuEngagementEntitiesListResponseData = Array<{
  link: {
  id: number;
  role: "primary_target" | "in_scope" | "out_of_scope" | "pivot" | "context";
  notes: string | null;
};
  entity: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
}>;
export type SecuEngagementEntitiesListResponse = import("../types").ApiEnvelope<SecuEngagementEntitiesListResponseData>;

export type SecuEngagementEntityLinkParams = {
  id: number;
};
export type SecuEngagementEntityLinkQuery = undefined;
export type SecuEngagementEntityLinkBody = {
  entityId?: number;
  upsert?: {
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  primaryValue: string;
  displayName?: string;
  discriminator?: string | null;
  data?: Record<string, any>;
};
  role?: "primary_target" | "in_scope" | "out_of_scope" | "pivot" | "context";
  notes?: string | null;
};
export type SecuEngagementEntityLinkResponseData = {
  id: number;
  created: boolean;
  entityId: number;
};
export type SecuEngagementEntityLinkResponse = import("../types").ApiEnvelope<SecuEngagementEntityLinkResponseData>;

export type SecuEngagementEntityUnlinkParams = {
  id: number;
  entityId: number;
};
export type SecuEngagementEntityUnlinkQuery = undefined;
export type SecuEngagementEntityUnlinkBody = undefined;
export type SecuEngagementEntityUnlinkResponseData = null;
export type SecuEngagementEntityUnlinkResponse = import("../types").ApiEnvelope<SecuEngagementEntityUnlinkResponseData>;

export type SecuEngagementNoteCreateParams = {
  id: number;
};
export type SecuEngagementNoteCreateQuery = undefined;
export type SecuEngagementNoteCreateBody = {
  body: string;
  title?: string;
  entityId?: number | null;
};
export type SecuEngagementNoteCreateResponseData = {
  id: number;
};
export type SecuEngagementNoteCreateResponse = import("../types").ApiEnvelope<SecuEngagementNoteCreateResponseData>;

export type SecuEngagementAuthGrantParams = {
  id: number;
};
export type SecuEngagementAuthGrantQuery = undefined;
export type SecuEngagementAuthGrantBody = {
  entityId: number;
  kind: "own" | "verified_ownership" | "written_consent" | "internal_lab";
  scope: "passive_only" | "active_safe" | "active_intrusive";
  proofType?: "dns_txt" | "http_file" | "written_contract" | "manual_owner_verification" | "none";
  proofRef?: string | null;
  verifiedAt?: any | null;
  expiresAt?: any | null;
  notes?: string | null;
};
export type SecuEngagementAuthGrantResponseData = {
  authorizationId: number;
  engagementEntityId: number;
};
export type SecuEngagementAuthGrantResponse = import("../types").ApiEnvelope<SecuEngagementAuthGrantResponseData>;

export type SecuEngagementAuthListParams = {
  id: number;
};
export type SecuEngagementAuthListQuery = undefined;
export type SecuEngagementAuthListBody = undefined;
export type SecuEngagementAuthListResponseData = Array<{
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
  entity: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
} | null;
  decision: {
  activeSafeAllowed: boolean;
  activeSafeReason: string;
  activeIntrusiveAllowed: boolean;
  activeIntrusiveReason: string;
};
}>;
export type SecuEngagementAuthListResponse = import("../types").ApiEnvelope<SecuEngagementAuthListResponseData>;

export type SecuEngagementAuthRevokeParams = {
  id: number;
  authorizationId: number;
};
export type SecuEngagementAuthRevokeQuery = undefined;
export type SecuEngagementAuthRevokeBody = undefined;
export type SecuEngagementAuthRevokeResponseData = {
  authorizationId: number;
  revokedAt: string;
};
export type SecuEngagementAuthRevokeResponse = import("../types").ApiEnvelope<SecuEngagementAuthRevokeResponseData>;

export type SecuEngagementOsintEmailLinkParams = {
  id: number;
};
export type SecuEngagementOsintEmailLinkQuery = undefined;
export type SecuEngagementOsintEmailLinkBody = {
  email: string;
  personId?: number | null;
};
export type SecuEngagementOsintEmailLinkResponseData = {
  entity: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
  engagementEntityId: number;
  relationshipId: number | null;
};
export type SecuEngagementOsintEmailLinkResponse = import("../types").ApiEnvelope<SecuEngagementOsintEmailLinkResponseData>;

export type SecuEngagementSignalChainsListParams = {
  id: number;
};
export type SecuEngagementSignalChainsListQuery = undefined;
export type SecuEngagementSignalChainsListBody = undefined;
export type SecuEngagementSignalChainsListResponseData = Array<{
  id: number;
  engagementId: number;
  rootEntityId: number | null;
  triggeredBy: string;
  signalChain: Array<Record<string, any>>;
  startedAt: string;
  finishedAt: string | null;
}>;
export type SecuEngagementSignalChainsListResponse = import("../types").ApiEnvelope<SecuEngagementSignalChainsListResponseData>;

export const apiRoutes_secu_engagements = {
  "secu_engagement_create": {
    method: "POST",
    path: "/engagements",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Create engagement (optional convenience: include primaryDomain to bootstrap entity + auth)",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementCreateParams;
      query: SecuEngagementCreateQuery;
      body: SecuEngagementCreateBody;
      response: SecuEngagementCreateResponse;
      responseData: SecuEngagementCreateResponseData;
    },
  },
  "secu_engagement_list": {
    method: "GET",
    path: "/engagements",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "List engagements",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementListParams;
      query: SecuEngagementListQuery;
      body: SecuEngagementListBody;
      response: SecuEngagementListResponse;
      responseData: SecuEngagementListResponseData;
    },
  },
  "secu_engagement_get": {
    method: "GET",
    path: "/engagements/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Get engagement (with embedded graph snapshot + counts)",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementGetParams;
      query: SecuEngagementGetQuery;
      body: SecuEngagementGetBody;
      response: SecuEngagementGetResponse;
      responseData: SecuEngagementGetResponseData;
    },
  },
  "secu_engagement_update": {
    method: "PATCH",
    path: "/engagements/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Update engagement",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementUpdateParams;
      query: SecuEngagementUpdateQuery;
      body: SecuEngagementUpdateBody;
      response: SecuEngagementUpdateResponse;
      responseData: SecuEngagementUpdateResponseData;
    },
  },
  "secu_engagement_archive": {
    method: "DELETE",
    path: "/engagements/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Archive engagement (soft delete)",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementArchiveParams;
      query: SecuEngagementArchiveQuery;
      body: SecuEngagementArchiveBody;
      response: SecuEngagementArchiveResponse;
      responseData: SecuEngagementArchiveResponseData;
    },
  },
  "secu_engagement_graph": {
    method: "GET",
    path: "/engagements/:id/graph",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Cytoscape-compatible graph snapshot for an engagement",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementGraphParams;
      query: SecuEngagementGraphQuery;
      body: SecuEngagementGraphBody;
      response: SecuEngagementGraphResponse;
      responseData: SecuEngagementGraphResponseData;
    },
  },
  "secu_engagement_entities_list": {
    method: "GET",
    path: "/engagements/:id/entities",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "List entities linked to an engagement",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementEntitiesListParams;
      query: SecuEngagementEntitiesListQuery;
      body: SecuEngagementEntitiesListBody;
      response: SecuEngagementEntitiesListResponse;
      responseData: SecuEngagementEntitiesListResponseData;
    },
  },
  "secu_engagement_entity_link": {
    method: "POST",
    path: "/engagements/:id/entities",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Link an entity to an engagement (or upsert+link in one call)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementEntityLinkParams;
      query: SecuEngagementEntityLinkQuery;
      body: SecuEngagementEntityLinkBody;
      response: SecuEngagementEntityLinkResponse;
      responseData: SecuEngagementEntityLinkResponseData;
    },
  },
  "secu_engagement_entity_unlink": {
    method: "DELETE",
    path: "/engagements/:id/entities/:entityId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Unlink an entity from an engagement",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementEntityUnlinkParams;
      query: SecuEngagementEntityUnlinkQuery;
      body: SecuEngagementEntityUnlinkBody;
      response: SecuEngagementEntityUnlinkResponse;
      responseData: SecuEngagementEntityUnlinkResponseData;
    },
  },
  "secu_engagement_note_create": {
    method: "POST",
    path: "/engagements/:id/notes",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Add a note (artifact kind=note) to an engagement",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementNoteCreateParams;
      query: SecuEngagementNoteCreateQuery;
      body: SecuEngagementNoteCreateBody;
      response: SecuEngagementNoteCreateResponse;
      responseData: SecuEngagementNoteCreateResponseData;
    },
  },
  "secu_engagement_auth_grant": {
    method: "POST",
    path: "/engagements/:id/authorizations",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Grant an authorization to an entity (also links the entity to the engagement)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementAuthGrantParams;
      query: SecuEngagementAuthGrantQuery;
      body: SecuEngagementAuthGrantBody;
      response: SecuEngagementAuthGrantResponse;
      responseData: SecuEngagementAuthGrantResponseData;
    },
  },
  "secu_engagement_auth_list": {
    method: "GET",
    path: "/engagements/:id/authorizations",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "List entity authorizations for an engagement with effective scan decisions",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementAuthListParams;
      query: SecuEngagementAuthListQuery;
      body: SecuEngagementAuthListBody;
      response: SecuEngagementAuthListResponse;
      responseData: SecuEngagementAuthListResponseData;
    },
  },
  "secu_engagement_auth_revoke": {
    method: "DELETE",
    path: "/engagements/:id/authorizations/:authorizationId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Revoke an authorization in an engagement",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementAuthRevokeParams;
      query: SecuEngagementAuthRevokeQuery;
      body: SecuEngagementAuthRevokeBody;
      response: SecuEngagementAuthRevokeResponse;
      responseData: SecuEngagementAuthRevokeResponseData;
    },
  },
  "secu_engagement_osint_email_link": {
    method: "POST",
    path: "/engagements/:id/entities/email",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Phase 2.7 — Lege email_address-Entity an, verlinke zur Person, Auto-Chain greift",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementOsintEmailLinkParams;
      query: SecuEngagementOsintEmailLinkQuery;
      body: SecuEngagementOsintEmailLinkBody;
      response: SecuEngagementOsintEmailLinkResponse;
      responseData: SecuEngagementOsintEmailLinkResponseData;
    },
  },
  "secu_engagement_signal_chains_list": {
    method: "GET",
    path: "/engagements/:id/signal-chains",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-engagements"],
      summary: "Phase 2.7 — Listet OSINT-Signal-Chain-Logs (manuelle person_full-Trigger + Auto-Chains)",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementSignalChainsListParams;
      query: SecuEngagementSignalChainsListQuery;
      body: SecuEngagementSignalChainsListBody;
      response: SecuEngagementSignalChainsListResponse;
      responseData: SecuEngagementSignalChainsListResponseData;
    },
  },
} as const;
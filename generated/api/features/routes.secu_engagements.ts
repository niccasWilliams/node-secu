// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T00:05:39.691Z
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
export type SecuEngagementCreateResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementCreateResponse = import("../types").ApiEnvelope<SecuEngagementCreateResponseData>;

export type SecuEngagementListParams = undefined;
export type SecuEngagementListQuery = {
  includeArchived?: boolean;
  kind?: "solo_lab" | "ctf" | "bug_bounty" | "customer_pentest" | "internal";
  ownerUserId?: number;
};
export type SecuEngagementListBody = undefined;
export type SecuEngagementListResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementListResponse = import("../types").ApiEnvelope<SecuEngagementListResponseData>;

export type SecuEngagementGetParams = {
  id: number;
};
export type SecuEngagementGetQuery = undefined;
export type SecuEngagementGetBody = undefined;
export type SecuEngagementGetResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
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
export type SecuEngagementUpdateResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementUpdateResponse = import("../types").ApiEnvelope<SecuEngagementUpdateResponseData>;

export type SecuEngagementArchiveParams = {
  id: number;
};
export type SecuEngagementArchiveQuery = undefined;
export type SecuEngagementArchiveBody = undefined;
export type SecuEngagementArchiveResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementArchiveResponse = import("../types").ApiEnvelope<SecuEngagementArchiveResponseData>;

export type SecuEngagementGraphParams = {
  id: number;
};
export type SecuEngagementGraphQuery = undefined;
export type SecuEngagementGraphBody = undefined;
export type SecuEngagementGraphResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementGraphResponse = import("../types").ApiEnvelope<SecuEngagementGraphResponseData>;

export type SecuEngagementEntitiesListParams = {
  id: number;
};
export type SecuEngagementEntitiesListQuery = {
  kind?: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document";
};
export type SecuEngagementEntitiesListBody = undefined;
export type SecuEngagementEntitiesListResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementEntitiesListResponse = import("../types").ApiEnvelope<SecuEngagementEntitiesListResponseData>;

export type SecuEngagementEntityLinkParams = {
  id: number;
};
export type SecuEngagementEntityLinkQuery = undefined;
export type SecuEngagementEntityLinkBody = {
  entityId?: number;
  upsert?: {
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document";
  primaryValue: string;
  displayName?: string;
  discriminator?: string | null;
  data?: Record<string, any>;
};
  role?: "primary_target" | "in_scope" | "out_of_scope" | "pivot" | "context";
  notes?: string | null;
};
export type SecuEngagementEntityLinkResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementEntityLinkResponse = import("../types").ApiEnvelope<SecuEngagementEntityLinkResponseData>;

export type SecuEngagementEntityUnlinkParams = {
  id: number;
  entityId: number;
};
export type SecuEngagementEntityUnlinkQuery = undefined;
export type SecuEngagementEntityUnlinkBody = undefined;
export type SecuEngagementEntityUnlinkResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
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
export type SecuEngagementNoteCreateResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
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
export type SecuEngagementAuthGrantResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEngagementAuthGrantResponse = import("../types").ApiEnvelope<SecuEngagementAuthGrantResponseData>;

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
} as const;
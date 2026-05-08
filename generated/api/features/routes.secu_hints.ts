// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T20:46:59.190Z
// Run `pnpm run api:generate` to regenerate

export type SecuEngagementHintsListParams = {
  id: number;
};
export type SecuEngagementHintsListQuery = undefined;
export type SecuEngagementHintsListBody = undefined;
export type SecuEngagementHintsListResponseData = Array<{
  id: number;
  engagementId: number;
  slot: "owner_name" | "owner_city" | "owner_company" | "owner_known_email" | "owner_known_username" | "owner_alt_domain" | "industry" | "free_text";
  value: string;
  source: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
}>;
export type SecuEngagementHintsListResponse = import("../types").ApiEnvelope<SecuEngagementHintsListResponseData>;

export type SecuEngagementHintsCreateParams = {
  id: number;
};
export type SecuEngagementHintsCreateQuery = undefined;
export type SecuEngagementHintsCreateBody = {
  items: Array<{
  slot: "owner_name" | "owner_city" | "owner_company" | "owner_known_email" | "owner_known_username" | "owner_alt_domain" | "industry" | "free_text";
  value: string;
  source?: string | null;
  notes?: string | null;
}>;
};
export type SecuEngagementHintsCreateResponseData = Array<{
  id: number;
  engagementId: number;
  slot: "owner_name" | "owner_city" | "owner_company" | "owner_known_email" | "owner_known_username" | "owner_alt_domain" | "industry" | "free_text";
  value: string;
  source: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
}>;
export type SecuEngagementHintsCreateResponse = import("../types").ApiEnvelope<SecuEngagementHintsCreateResponseData>;

export type SecuEngagementHintsPatchParams = {
  id: number;
  hintId: number;
};
export type SecuEngagementHintsPatchQuery = undefined;
export type SecuEngagementHintsPatchBody = {
  value?: string;
  source?: string | null;
  notes?: string | null;
};
export type SecuEngagementHintsPatchResponseData = {
  id: number;
  engagementId: number;
  slot: "owner_name" | "owner_city" | "owner_company" | "owner_known_email" | "owner_known_username" | "owner_alt_domain" | "industry" | "free_text";
  value: string;
  source: string | null;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
};
export type SecuEngagementHintsPatchResponse = import("../types").ApiEnvelope<SecuEngagementHintsPatchResponseData>;

export type SecuEngagementHintsDeleteParams = {
  id: number;
  hintId: number;
};
export type SecuEngagementHintsDeleteQuery = undefined;
export type SecuEngagementHintsDeleteBody = undefined;
export type SecuEngagementHintsDeleteResponseData = null;
export type SecuEngagementHintsDeleteResponse = import("../types").ApiEnvelope<SecuEngagementHintsDeleteResponseData>;

export const apiRoutes_secu_hints = {
  "secu_engagement_hints_list": {
    method: "GET",
    path: "/engagements/:id/hints",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-hints"],
      summary: "List operator hints attached to an engagement (Sprint 1, OSINT seed material)",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementHintsListParams;
      query: SecuEngagementHintsListQuery;
      body: SecuEngagementHintsListBody;
      response: SecuEngagementHintsListResponse;
      responseData: SecuEngagementHintsListResponseData;
    },
  },
  "secu_engagement_hints_create": {
    method: "POST",
    path: "/engagements/:id/hints",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-hints"],
      summary: "Create one or more operator hints for an engagement (bulk)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementHintsCreateParams;
      query: SecuEngagementHintsCreateQuery;
      body: SecuEngagementHintsCreateBody;
      response: SecuEngagementHintsCreateResponse;
      responseData: SecuEngagementHintsCreateResponseData;
    },
  },
  "secu_engagement_hints_patch": {
    method: "PATCH",
    path: "/engagements/:id/hints/:hintId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-hints"],
      summary: "Patch a single hint (value/source/notes)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuEngagementHintsPatchParams;
      query: SecuEngagementHintsPatchQuery;
      body: SecuEngagementHintsPatchBody;
      response: SecuEngagementHintsPatchResponse;
      responseData: SecuEngagementHintsPatchResponseData;
    },
  },
  "secu_engagement_hints_delete": {
    method: "DELETE",
    path: "/engagements/:id/hints/:hintId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-hints"],
      summary: "Delete a hint",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuEngagementHintsDeleteParams;
      query: SecuEngagementHintsDeleteQuery;
      body: SecuEngagementHintsDeleteBody;
      response: SecuEngagementHintsDeleteResponse;
      responseData: SecuEngagementHintsDeleteResponseData;
    },
  },
} as const;
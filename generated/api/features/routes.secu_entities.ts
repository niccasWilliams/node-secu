// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T00:05:39.693Z
// Run `pnpm run api:generate` to regenerate

export type SecuEntityUpsertParams = undefined;
export type SecuEntityUpsertQuery = undefined;
export type SecuEntityUpsertBody = {
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document";
  primaryValue: string;
  displayName?: string;
  discriminator?: string | null;
  data?: Record<string, any>;
};
export type SecuEntityUpsertResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEntityUpsertResponse = import("../types").ApiEnvelope<SecuEntityUpsertResponseData>;

export type SecuEntitySearchParams = undefined;
export type SecuEntitySearchQuery = {
  kind?: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document";
  q?: string;
  limit?: number;
  offset?: number;
};
export type SecuEntitySearchBody = undefined;
export type SecuEntitySearchResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEntitySearchResponse = import("../types").ApiEnvelope<SecuEntitySearchResponseData>;

export type SecuEntityGetParams = {
  id: number;
};
export type SecuEntityGetQuery = undefined;
export type SecuEntityGetBody = undefined;
export type SecuEntityGetResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEntityGetResponse = import("../types").ApiEnvelope<SecuEntityGetResponseData>;

export type SecuEntityRelationshipsListParams = {
  id: number;
};
export type SecuEntityRelationshipsListQuery = undefined;
export type SecuEntityRelationshipsListBody = undefined;
export type SecuEntityRelationshipsListResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
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
export type SecuEntityRelationshipUpsertResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEntityRelationshipUpsertResponse = import("../types").ApiEnvelope<SecuEntityRelationshipUpsertResponseData>;

export type SecuEntityTagAddParams = {
  id: number;
};
export type SecuEntityTagAddQuery = undefined;
export type SecuEntityTagAddBody = {
  tag: string;
  color?: string | null;
};
export type SecuEntityTagAddResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuEntityTagAddResponse = import("../types").ApiEnvelope<SecuEntityTagAddResponseData>;

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
      summary: "Get entity detail (incl. tags, engagements, relationship-count)",
      validated: {"params":true,"query":false,"body":false},
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
} as const;
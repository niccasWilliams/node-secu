// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-09T01:32:39.222Z
// Run `pnpm run api:generate` to regenerate

export type SecuIntelCrossEngagementHitsParams = undefined;
export type SecuIntelCrossEngagementHitsQuery = {
  kinds?: string;
  limit?: number;
};
export type SecuIntelCrossEngagementHitsBody = undefined;
export type SecuIntelCrossEngagementHitsResponseData = {
  items: Array<{
  entity: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
  engagementIds: Array<number>;
  engagementCount: number;
}>;
};
export type SecuIntelCrossEngagementHitsResponse = import("../types").ApiEnvelope<SecuIntelCrossEngagementHitsResponseData>;

export type SecuIntelTechGraphParams = undefined;
export type SecuIntelTechGraphQuery = {
  minEngagements?: number;
  limit?: number;
};
export type SecuIntelTechGraphBody = undefined;
export type SecuIntelTechGraphResponseData = {
  items: Array<{
  techName: string;
  engagementIds: Array<number>;
  entityCount: number;
}>;
};
export type SecuIntelTechGraphResponse = import("../types").ApiEnvelope<SecuIntelTechGraphResponseData>;

export type SecuIntelTechUsagesParams = {
  techName: string;
};
export type SecuIntelTechUsagesQuery = {
  limit?: number;
};
export type SecuIntelTechUsagesBody = undefined;
export type SecuIntelTechUsagesResponseData = {
  items: Array<{
  entity: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
  engagementIds: Array<number>;
  tech: Array<{
  techName: string;
  version?: string | null;
  source?: string | null;
  lastSeenAt?: string | null;
}>;
}>;
};
export type SecuIntelTechUsagesResponse = import("../types").ApiEnvelope<SecuIntelTechUsagesResponseData>;

export type SecuIntelEntityNeighborhoodParams = {
  id: number;
};
export type SecuIntelEntityNeighborhoodQuery = {
  depth?: number;
  limit?: number;
};
export type SecuIntelEntityNeighborhoodBody = undefined;
export type SecuIntelEntityNeighborhoodResponseData = {
  center: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
} | null;
  nodes: Array<{
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
}>;
  edges: Array<{
  id: number;
  fromEntityId: number;
  toEntityId: number;
  kind: string;
  data: Record<string, any>;
  confidence: number;
  source: string;
  firstObservedAt: string;
  lastObservedAt: string;
}>;
};
export type SecuIntelEntityNeighborhoodResponse = import("../types").ApiEnvelope<SecuIntelEntityNeighborhoodResponseData>;

export type SecuIntelIdentityBundleParams = {
  personId: number;
};
export type SecuIntelIdentityBundleQuery = undefined;
export type SecuIntelIdentityBundleBody = undefined;
export type SecuIntelIdentityBundleResponseData = {
  person: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  canonicalKey: string;
  data: Record<string, any>;
  firstSeenAt: string;
  lastSeenAt: string;
};
  aliases: Array<{
  entity: {
  id: number;
  kind: "asset_domain" | "asset_subdomain" | "asset_ip" | "asset_host" | "asset_url" | "person" | "organization" | "location" | "credential_ref" | "document" | "email_address" | "username" | "phone_number" | "social_account" | "infrastructure_provider";
  displayName: string;
  data: Record<string, any>;
};
  relationshipId: number;
  relationKind: string;
  confidence: number;
  addedAt: string;
}>;
  engagements: Array<{
  id: number;
  name: string;
  slug: string;
  role: "primary_target" | "in_scope" | "out_of_scope" | "pivot" | "context";
  findingCount: number;
  findingsBySeverity: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};
  lastActivityAt: string | null;
}>;
  globalFindings: {
  total: number;
  bySeverity: {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};
  byStatus: Record<string, number>;
  recent: Array<{
  id: number;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  engagementId: number;
  createdAt: string;
}>;
};
  authorizations: Array<{
  engagementId: number;
  scope: "passive_only" | "active_safe" | "active_intrusive";
  decision: {
  activeSafeAllowed: boolean;
  activeIntrusiveAllowed: boolean;
};
}>;
};
export type SecuIntelIdentityBundleResponse = import("../types").ApiEnvelope<SecuIntelIdentityBundleResponseData>;

export const apiRoutes_secu_intelligence = {
  "secu_intel_cross_engagement_hits": {
    method: "GET",
    path: "/intelligence/cross-engagement-hits",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-intelligence"],
      summary: "Entities, die in 2+ aktiven Engagements vorkommen (Identity-Pivots)",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuIntelCrossEngagementHitsParams;
      query: SecuIntelCrossEngagementHitsQuery;
      body: SecuIntelCrossEngagementHitsBody;
      response: SecuIntelCrossEngagementHitsResponse;
      responseData: SecuIntelCrossEngagementHitsResponseData;
    },
  },
  "secu_intel_tech_graph": {
    method: "GET",
    path: "/intelligence/tech-graph",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-intelligence"],
      summary: "Aggregierter Tech-Graph: welche Tech-Stacks tauchen über mehrere Engagements auf?",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuIntelTechGraphParams;
      query: SecuIntelTechGraphQuery;
      body: SecuIntelTechGraphBody;
      response: SecuIntelTechGraphResponse;
      responseData: SecuIntelTechGraphResponseData;
    },
  },
  "secu_intel_tech_usages": {
    method: "GET",
    path: "/intelligence/tech/:techName/usages",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-intelligence"],
      summary: "Wo (Entities + Engagements) wird ein konkreter Tech-Fingerprint gefunden?",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuIntelTechUsagesParams;
      query: SecuIntelTechUsagesQuery;
      body: SecuIntelTechUsagesBody;
      response: SecuIntelTechUsagesResponse;
      responseData: SecuIntelTechUsagesResponseData;
    },
  },
  "secu_intel_entity_neighborhood": {
    method: "GET",
    path: "/intelligence/entities/:id/neighborhood",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-intelligence"],
      summary: "k-Hop-Neighborhood einer Entity über alle Engagements (Lazy-Mindmap-Loading)",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuIntelEntityNeighborhoodParams;
      query: SecuIntelEntityNeighborhoodQuery;
      body: SecuIntelEntityNeighborhoodBody;
      response: SecuIntelEntityNeighborhoodResponse;
      responseData: SecuIntelEntityNeighborhoodResponseData;
    },
  },
  "secu_intel_identity_bundle": {
    method: "GET",
    path: "/intelligence/identities/:personId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-intelligence"],
      summary: "Identity-Bundle: Person + Aliases + Engagements + globale Findings + Auth-Decisions",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuIntelIdentityBundleParams;
      query: SecuIntelIdentityBundleQuery;
      body: SecuIntelIdentityBundleBody;
      response: SecuIntelIdentityBundleResponse;
      responseData: SecuIntelIdentityBundleResponseData;
    },
  },
} as const;
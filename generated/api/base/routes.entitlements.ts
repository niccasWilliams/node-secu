// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-04T18:32:46.346Z
// Run `pnpm run api:generate` to regenerate

import type { Role, RoleAssignment } from "../../frontend-types";

export type EntitlementsListParams = undefined;
export type EntitlementsListQuery = {

};
export type EntitlementsListBody = undefined;
export type EntitlementsListResponseData = { app: { appId: string }; data: Array<{ externalIdentifier: string; entitlementType: 'role' | 'area'; externalName: string; externalDescription: string | null }>; total: number };
export type EntitlementsListResponse = import("../types").ApiEnvelope<EntitlementsListResponseData>;

export type EntitlementsAssignParams = undefined;
export type EntitlementsAssignQuery = undefined;
export type EntitlementsAssignBody = {
  externalUserId: string;
  externalIdentifier: string;
  entitlementType: "role" | "area";
  validFrom?: string | null;
  expiresAt?: string | null;
  limits?: Record<string, {
  included: number;
  behavior: string;
  payAsYouGoActive: boolean;
  maxOverageQuantity?: number | null;
  overagePricePerUnit?: number | null;
}>;
  credits?: Record<string, {
  remaining: number;
  type: string;
  pools?: Array<{
  poolId: number;
  creditType: string;
  totalCredits: number;
  usedCredits: number;
  remaining: number;
  expiresAt: string | null;
}>;
}>;
};
export type EntitlementsAssignResponseData = { created: boolean; externalUserId: string; externalIdentifier: string; entitlementType: 'role' | 'area'; validFrom: Date; expiresAt: Date | null };
export type EntitlementsAssignResponse = import("../types").ApiEnvelope<EntitlementsAssignResponseData>;

export type EntitlementsGetStateParams = {
  userId: string;
  type: "role" | "area";
  identifier: string;
};
export type EntitlementsGetStateQuery = undefined;
export type EntitlementsGetStateBody = undefined;
export type EntitlementsGetStateResponseData = { externalUserId: string; externalIdentifier: string; entitlementType: 'role' | 'area'; validFrom: Date; expiresAt: Date | null };
export type EntitlementsGetStateResponse = import("../types").ApiEnvelope<EntitlementsGetStateResponseData>;

export type EntitlementsUpdateStateParams = {
  userId: string;
  type: "role" | "area";
  identifier: string;
};
export type EntitlementsUpdateStateQuery = undefined;
export type EntitlementsUpdateStateBody = {
  validFrom?: string | null;
  expiresAt?: string | null;
};
export type EntitlementsUpdateStateResponseData = { success: boolean; externalUserId: string; externalIdentifier: string; entitlementType: 'role' | 'area'; validFrom: Date; expiresAt: Date | null };
export type EntitlementsUpdateStateResponse = import("../types").ApiEnvelope<EntitlementsUpdateStateResponseData>;

export type EntitlementsRevokeParams = {
  userId: string;
  type: "role" | "area";
  identifier: string;
};
export type EntitlementsRevokeQuery = undefined;
export type EntitlementsRevokeBody = undefined;
export type EntitlementsRevokeResponseData = { success: boolean; revoked: boolean };
export type EntitlementsRevokeResponse = import("../types").ApiEnvelope<EntitlementsRevokeResponseData>;

export type EntitlementsGetAllParams = undefined;
export type EntitlementsGetAllQuery = {

};
export type EntitlementsGetAllBody = undefined;
export type EntitlementsGetAllResponseData = { app: { appId: string }; data: Array<{ externalIdentifier: string; entitlementType: 'role' | 'area'; externalName: string; externalDescription: string | null }>; total: number };
export type EntitlementsGetAllResponse = import("../types").ApiEnvelope<EntitlementsGetAllResponseData>;

export type EntitlementsGetAssignedParams = undefined;
export type EntitlementsGetAssignedQuery = {
  userId?: string;
};
export type EntitlementsGetAssignedBody = undefined;
export type EntitlementsGetAssignedResponseData = { data: RoleAssignment[]; total: number };
export type EntitlementsGetAssignedResponse = import("../types").ApiEnvelope<EntitlementsGetAssignedResponseData>;

export type EntitlementsGetUserEntitlementsParams = {
  userId: string;
};
export type EntitlementsGetUserEntitlementsQuery = undefined;
export type EntitlementsGetUserEntitlementsBody = undefined;
export type EntitlementsGetUserEntitlementsResponseData = { data: Role[]; total: number };
export type EntitlementsGetUserEntitlementsResponse = import("../types").ApiEnvelope<EntitlementsGetUserEntitlementsResponseData>;

export type EntitlementsContextGetByShopAssignmentParams = {
  shopAssignmentId: string;
};
export type EntitlementsContextGetByShopAssignmentQuery = undefined;
export type EntitlementsContextGetByShopAssignmentBody = undefined;
export type EntitlementsContextGetByShopAssignmentResponseData = { id: number } & Record<string, unknown>;
export type EntitlementsContextGetByShopAssignmentResponse = import("../types").ApiEnvelope<EntitlementsContextGetByShopAssignmentResponseData>;

export type EntitlementsUsageOveragesPullParams = undefined;
export type EntitlementsUsageOveragesPullQuery = {
  since?: string;
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
};
export type EntitlementsUsageOveragesPullBody = undefined;
export type EntitlementsUsageOveragesPullResponseData = Array<Record<string, unknown>>;
export type EntitlementsUsageOveragesPullResponse = import("../types").ApiEnvelope<EntitlementsUsageOveragesPullResponseData>;

export type EntitlementsGetByIdParams = {
  id: number;
};
export type EntitlementsGetByIdQuery = undefined;
export type EntitlementsGetByIdBody = undefined;
export type EntitlementsGetByIdResponseData = Role;
export type EntitlementsGetByIdResponse = import("../types").ApiEnvelope<EntitlementsGetByIdResponseData>;

export const apiRoutes_entitlements = {
  "entitlements_list": {
    method: "GET",
    path: "/entitlements",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "List available entitlements",
      description: "Returns available entitlements for sync. Payload follows the external entitlements contract.",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsListParams;
      query: EntitlementsListQuery;
      body: EntitlementsListBody;
      response: EntitlementsListResponse;
      responseData: EntitlementsListResponseData;
    },
  },
  "entitlements_assign": {
    method: "POST",
    path: "/entitlements",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:write"]},
    meta: {
      tags: ["entitlements"],
      summary: "Assign entitlement to user",
      description: "Assigns an entitlement to a user. Idempotent behavior: existing assignment is updated and returns 200.",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: EntitlementsAssignParams;
      query: EntitlementsAssignQuery;
      body: EntitlementsAssignBody;
      response: EntitlementsAssignResponse;
      responseData: EntitlementsAssignResponseData;
    },
  },
  "entitlements_get_state": {
    method: "GET",
    path: "/entitlements/:userId/:type/:identifier",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "Get current entitlement state",
      description: "Returns the current entitlement assignment for one user + identifier tuple.",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsGetStateParams;
      query: EntitlementsGetStateQuery;
      body: EntitlementsGetStateBody;
      response: EntitlementsGetStateResponse;
      responseData: EntitlementsGetStateResponseData;
    },
  },
  "entitlements_update_state": {
    method: "PUT",
    path: "/entitlements/:userId/:type/:identifier",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read","entitlements:write"]},
    meta: {
      tags: ["entitlements"],
      summary: "Update entitlement validity",
      description: "Updates (or creates) a single entitlement assignment for one user + identifier tuple.",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: EntitlementsUpdateStateParams;
      query: EntitlementsUpdateStateQuery;
      body: EntitlementsUpdateStateBody;
      response: EntitlementsUpdateStateResponse;
      responseData: EntitlementsUpdateStateResponseData;
    },
  },
  "entitlements_revoke": {
    method: "DELETE",
    path: "/entitlements/:userId/:type/:identifier",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:write"]},
    meta: {
      tags: ["entitlements"],
      summary: "Revoke entitlement from user",
      description: "Revokes the entitlement assignment. Idempotent: missing assignment still returns success.",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsRevokeParams;
      query: EntitlementsRevokeQuery;
      body: EntitlementsRevokeBody;
      response: EntitlementsRevokeResponse;
      responseData: EntitlementsRevokeResponseData;
    },
  },
  "entitlements_getAll": {
    method: "GET",
    path: "/entitlements/getAll",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "Alias for listing entitlements",
      description: "Alias endpoint for backwards compatibility.",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsGetAllParams;
      query: EntitlementsGetAllQuery;
      body: EntitlementsGetAllBody;
      response: EntitlementsGetAllResponse;
      responseData: EntitlementsGetAllResponseData;
    },
  },
  "entitlements_getAssigned": {
    method: "GET",
    path: "/entitlements/assigned",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "Get role assignments (legacy)",
      description: "Legacy endpoint for active role assignments.",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsGetAssignedParams;
      query: EntitlementsGetAssignedQuery;
      body: EntitlementsGetAssignedBody;
      response: EntitlementsGetAssignedResponse;
      responseData: EntitlementsGetAssignedResponseData;
    },
  },
  "entitlements_getUserEntitlements": {
    method: "GET",
    path: "/entitlements/user/:userId",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "Get active user entitlements (legacy)",
      description: "Legacy endpoint returning active user roles with permissions.",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsGetUserEntitlementsParams;
      query: EntitlementsGetUserEntitlementsQuery;
      body: EntitlementsGetUserEntitlementsBody;
      response: EntitlementsGetUserEntitlementsResponse;
      responseData: EntitlementsGetUserEntitlementsResponseData;
    },
  },
  "entitlements_context_get_by_shop_assignment": {
    method: "GET",
    path: "/entitlements/context/by-shop-assignment/:shopAssignmentId",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "Get entitlement sync context by shop assignment id",
      description: "Returns the persisted entitlement-sync context row (shop linkage + local assignment references) for a given x-shop-assignment-id.",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsContextGetByShopAssignmentParams;
      query: EntitlementsContextGetByShopAssignmentQuery;
      body: EntitlementsContextGetByShopAssignmentBody;
      response: EntitlementsContextGetByShopAssignmentResponse;
      responseData: EntitlementsContextGetByShopAssignmentResponseData;
    },
  },
  "entitlements_usage_overages_pull": {
    method: "GET",
    path: "/entitlements/usage-overages",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "Pull usage overages",
      description: "Returns deterministic usage-overage events for shop-initiated pull billing sync. Endpoint is idempotent via stable externalEventId per event snapshot.",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsUsageOveragesPullParams;
      query: EntitlementsUsageOveragesPullQuery;
      body: EntitlementsUsageOveragesPullBody;
      response: EntitlementsUsageOveragesPullResponse;
      responseData: EntitlementsUsageOveragesPullResponseData;
    },
  },
  "entitlements_getById": {
    method: "GET",
    path: "/entitlements/:id",
    auth: {"type":"unified_bearer","allowUserSession":false,"scopes":["entitlements:read"]},
    meta: {
      tags: ["entitlements"],
      summary: "Get entitlement by role id (legacy)",
      description: "Legacy endpoint: returns sellable role details by numeric role id.",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: EntitlementsGetByIdParams;
      query: EntitlementsGetByIdQuery;
      body: EntitlementsGetByIdBody;
      response: EntitlementsGetByIdResponse;
      responseData: EntitlementsGetByIdResponseData;
    },
  },
} as const;
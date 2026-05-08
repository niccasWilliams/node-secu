// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.137Z
// Run `pnpm run api:generate` to regenerate

import type { NodeTemplateUser, Permission, Role } from "../../frontend-types";

export type AppInfoHealthParams = undefined;
export type AppInfoHealthQuery = undefined;
export type AppInfoHealthBody = undefined;
export type AppInfoHealthResponseData = {
  status: string;
  timestamp: string;
  uptime: number;
};
export type AppInfoHealthResponse = import("../types").ApiEnvelope<AppInfoHealthResponseData>;

export type AppInfoManifestParams = undefined;
export type AppInfoManifestQuery = undefined;
export type AppInfoManifestBody = undefined;
export type AppInfoManifestResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type AppInfoManifestResponse = import("../types").ApiEnvelope<AppInfoManifestResponseData>;

export type AppInfoGetParams = undefined;
export type AppInfoGetQuery = {

};
export type AppInfoGetBody = undefined;
export type AppInfoGetResponseData = { plannerUser: NodeTemplateUser; plannerUsers?: NodeTemplateUser[]; userRoles: Role[]; subscriptionLimits?: { planCode: 'base' | 'premium' | 'enterprise' | 'legacy'; sourceRoles: string[]; maxManagingCompanies: number | null; maxDocumentStorageGb: number | null }; subscriptionUsage?: { managingCompanies: { used: number; limit: number | null; remaining: number | null; canCreate: boolean }; documentStorage: { costPerGbEur: number; pricePerGbEur: number; usedBytes: number; usedGb: number; documentsCount: number; limitGb: number | null; remainingGb: number | null; canUpload: boolean; estimatedProviderCostEur: number; estimatedCustomerPriceEur: number; estimatedMarginEur: number; byManagingCompany: Array<{ managingCompanyId: number; companyName: string | null; documentsCount: number; usedBytes: number; usedGb: number; estimatedProviderCostEur: number; estimatedCustomerPriceEur: number; estimatedMarginEur: number }> } }; subscription?: { canCreateManagingCompany: boolean; canUploadDocuments: boolean; upgradeUrl: string | null } };
export type AppInfoGetResponse = import("../types").ApiEnvelope<AppInfoGetResponseData>;

export type AppInfoOwnPermissionsGetParams = undefined;
export type AppInfoOwnPermissionsGetQuery = {

};
export type AppInfoOwnPermissionsGetBody = undefined;
export type AppInfoOwnPermissionsGetResponseData = Permission[];
export type AppInfoOwnPermissionsGetResponse = import("../types").ApiEnvelope<AppInfoOwnPermissionsGetResponseData>;

export const apiRoutes_app_info = {
  "app_info_health": {
    method: "GET",
    path: "/app-info/health",
    auth: {"type":"public"},
    meta: {
      tags: ["app-info"],
      summary: "Health check",
      validated: {"params":false,"query":false,"body":false},
    },
    types: null as unknown as {
      params: AppInfoHealthParams;
      query: AppInfoHealthQuery;
      body: AppInfoHealthBody;
      response: AppInfoHealthResponse;
      responseData: AppInfoHealthResponseData;
    },
  },
  "app_info_manifest": {
    method: "GET",
    path: "/app-info/manifest",
    auth: {"type":"public"},
    meta: {
      tags: ["app-info"],
      summary: "AMP App Manifest",
      validated: {"params":false,"query":false,"body":false},
    },
    types: null as unknown as {
      params: AppInfoManifestParams;
      query: AppInfoManifestQuery;
      body: AppInfoManifestBody;
      response: AppInfoManifestResponse;
      responseData: AppInfoManifestResponseData;
    },
  },
  "app_info_get": {
    method: "GET",
    path: "/app-info",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["app-info"],
      summary: "Get app info for current user",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: AppInfoGetParams;
      query: AppInfoGetQuery;
      body: AppInfoGetBody;
      response: AppInfoGetResponse;
      responseData: AppInfoGetResponseData;
    },
  },
  "app_info_own_permissions_get": {
    method: "GET",
    path: "/app-info/ownPermissions",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["app-info"],
      summary: "Get own permissions",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: AppInfoOwnPermissionsGetParams;
      query: AppInfoOwnPermissionsGetQuery;
      body: AppInfoOwnPermissionsGetBody;
      response: AppInfoOwnPermissionsGetResponse;
      responseData: AppInfoOwnPermissionsGetResponseData;
    },
  },
} as const;
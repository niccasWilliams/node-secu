// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T21:27:24.256Z
// Run `pnpm run api:generate` to regenerate

export type SecuCatalogEnumsParams = undefined;
export type SecuCatalogEnumsQuery = undefined;
export type SecuCatalogEnumsBody = undefined;
export type SecuCatalogEnumsResponseData = {
  enums: Record<string, {
  key: string;
  label: string;
  values: Array<string>;
  options: Array<{
  value: string | number | boolean;
  label: string;
  description?: string;
  color?: "neutral" | "info" | "success" | "warning" | "danger";
  icon?: string;
}>;
}>;
};
export type SecuCatalogEnumsResponse = import("../types").ApiEnvelope<SecuCatalogEnumsResponseData>;

export type SecuCatalogPlaybooksParams = undefined;
export type SecuCatalogPlaybooksQuery = undefined;
export type SecuCatalogPlaybooksBody = undefined;
export type SecuCatalogPlaybooksResponseData = {
  items: Array<{
  key: string;
  label: string;
  description: string;
  category: string;
  danger: "passive" | "active_safe" | "active_intrusive";
  expectedRuntimeSec: number | null;
  requiredScope: "passive_only" | "active_safe" | "active_intrusive";
  acceptsRootEntityKinds: Array<string>;
  stepCount: number;
}>;
};
export type SecuCatalogPlaybooksResponse = import("../types").ApiEnvelope<SecuCatalogPlaybooksResponseData>;

export type SecuCatalogWorkersParams = undefined;
export type SecuCatalogWorkersQuery = undefined;
export type SecuCatalogWorkersBody = undefined;
export type SecuCatalogWorkersResponseData = {
  items: Array<{
  jobKey: string;
  label: string;
  description: string;
  category: string;
  requiredScope: "passive_only" | "active_safe" | "active_intrusive";
  defaultTimeoutMs: number;
  targetKinds: Array<string>;
}>;
};
export type SecuCatalogWorkersResponse = import("../types").ApiEnvelope<SecuCatalogWorkersResponseData>;

export const apiRoutes_secu_catalog = {
  "secu_catalog_enums": {
    method: "GET",
    path: "/catalog/enums",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-catalog"],
      summary: "All system enums (severity, status, kinds, scopes, ...) with display metadata for schema-driven UI",
    },
    types: null as unknown as {
      params: SecuCatalogEnumsParams;
      query: SecuCatalogEnumsQuery;
      body: SecuCatalogEnumsBody;
      response: SecuCatalogEnumsResponse;
      responseData: SecuCatalogEnumsResponseData;
    },
  },
  "secu_catalog_playbooks": {
    method: "GET",
    path: "/catalog/playbooks",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-catalog"],
      summary: "Registered playbooks with display metadata (label, category, danger, requiredScope)",
    },
    types: null as unknown as {
      params: SecuCatalogPlaybooksParams;
      query: SecuCatalogPlaybooksQuery;
      body: SecuCatalogPlaybooksBody;
      response: SecuCatalogPlaybooksResponse;
      responseData: SecuCatalogPlaybooksResponseData;
    },
  },
  "secu_catalog_workers": {
    method: "GET",
    path: "/catalog/workers",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-catalog"],
      summary: "Registered workers with display metadata (jobKey, category, scope, target kinds)",
    },
    types: null as unknown as {
      params: SecuCatalogWorkersParams;
      query: SecuCatalogWorkersQuery;
      body: SecuCatalogWorkersBody;
      response: SecuCatalogWorkersResponse;
      responseData: SecuCatalogWorkersResponseData;
    },
  },
} as const;
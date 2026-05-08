// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T00:05:39.693Z
// Run `pnpm run api:generate` to regenerate

export type SecuPlaybookRegistryListParams = undefined;
export type SecuPlaybookRegistryListQuery = undefined;
export type SecuPlaybookRegistryListBody = undefined;
export type SecuPlaybookRegistryListResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuPlaybookRegistryListResponse = import("../types").ApiEnvelope<SecuPlaybookRegistryListResponseData>;

export type SecuPlaybookRunStartParams = {
  id: number;
  playbookKey: string;
};
export type SecuPlaybookRunStartQuery = undefined;
export type SecuPlaybookRunStartBody = {
  rootEntityId: number;
  params?: Record<string, any>;
  triggeredBy?: string;
};
export type SecuPlaybookRunStartResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuPlaybookRunStartResponse = import("../types").ApiEnvelope<SecuPlaybookRunStartResponseData>;

export type SecuPlaybookRunListParams = {
  id: number;
};
export type SecuPlaybookRunListQuery = undefined;
export type SecuPlaybookRunListBody = undefined;
export type SecuPlaybookRunListResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuPlaybookRunListResponse = import("../types").ApiEnvelope<SecuPlaybookRunListResponseData>;

export type SecuPlaybookRunGetParams = {
  id: number;
  runId: number;
};
export type SecuPlaybookRunGetQuery = undefined;
export type SecuPlaybookRunGetBody = undefined;
export type SecuPlaybookRunGetResponseData = import("../types").ContractNotReady<"Response type not ready. Use typeRef(\"...\") (preferred) or a concrete Zod schema for responses[].data.">;
export type SecuPlaybookRunGetResponse = import("../types").ApiEnvelope<SecuPlaybookRunGetResponseData>;

export const apiRoutes_secu_playbooks = {
  "secu_playbook_registry_list": {
    method: "GET",
    path: "/playbooks",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "List all registered playbooks (registry view)",
    },
    types: null as unknown as {
      params: SecuPlaybookRegistryListParams;
      query: SecuPlaybookRegistryListQuery;
      body: SecuPlaybookRegistryListBody;
      response: SecuPlaybookRegistryListResponse;
      responseData: SecuPlaybookRegistryListResponseData;
    },
  },
  "secu_playbook_run_start": {
    method: "POST",
    path: "/engagements/:id/playbooks/:playbookKey",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "Start a playbook run for an engagement (background-executed; returns 202 immediately)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuPlaybookRunStartParams;
      query: SecuPlaybookRunStartQuery;
      body: SecuPlaybookRunStartBody;
      response: SecuPlaybookRunStartResponse;
      responseData: SecuPlaybookRunStartResponseData;
    },
  },
  "secu_playbook_run_list": {
    method: "GET",
    path: "/engagements/:id/playbooks/runs",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "List playbook runs for an engagement",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuPlaybookRunListParams;
      query: SecuPlaybookRunListQuery;
      body: SecuPlaybookRunListBody;
      response: SecuPlaybookRunListResponse;
      responseData: SecuPlaybookRunListResponseData;
    },
  },
  "secu_playbook_run_get": {
    method: "GET",
    path: "/engagements/:id/playbooks/runs/:runId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-playbooks"],
      summary: "Get a single playbook run incl. step summary + worker_runs",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuPlaybookRunGetParams;
      query: SecuPlaybookRunGetQuery;
      body: SecuPlaybookRunGetBody;
      response: SecuPlaybookRunGetResponse;
      responseData: SecuPlaybookRunGetResponseData;
    },
  },
} as const;
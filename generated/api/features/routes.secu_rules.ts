// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T21:09:35.389Z
// Run `pnpm run api:generate` to regenerate

export type SecuRuleListParams = undefined;
export type SecuRuleListQuery = {
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "updatedAt" | "name" | "fireCount" | "lastFiredAt";
  order?: "asc" | "desc";
  search?: string;
  trigger?: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed" | "schedule";
  enabled?: "true" | "false";
  scope?: string;
};
export type SecuRuleListBody = undefined;
export type SecuRuleListResponseData = Array<{
  id: number;
  name: string;
  description: string | null;
  scope: string;
  trigger: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed" | "schedule";
  action: "start_playbook" | "tag_entity" | "notify_boss" | "create_finding";
  condition: Record<string, any> | null;
  actionParams: Record<string, any>;
  enabled: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  fireCount: number;
  lastFiredAt: string | null;
}>;
export type SecuRuleListResponse = import("../types").ApiEnvelope<SecuRuleListResponseData>;

export type SecuRuleGetParams = {
  id: number;
};
export type SecuRuleGetQuery = undefined;
export type SecuRuleGetBody = undefined;
export type SecuRuleGetResponseData = {
  id: number;
  name: string;
  description: string | null;
  scope: string;
  trigger: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed" | "schedule";
  action: "start_playbook" | "tag_entity" | "notify_boss" | "create_finding";
  condition: Record<string, any> | null;
  actionParams: Record<string, any>;
  enabled: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  fireCount: number;
  lastFiredAt: string | null;
};
export type SecuRuleGetResponse = import("../types").ApiEnvelope<SecuRuleGetResponseData>;

export type SecuRuleCreateParams = undefined;
export type SecuRuleCreateQuery = undefined;
export type SecuRuleCreateBody = {
  name: string;
  description?: string | null;
  scope?: string;
  trigger: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed" | "schedule";
  action: "start_playbook" | "tag_entity" | "notify_boss" | "create_finding";
  condition?: Record<string, any> | null;
  actionParams?: Record<string, any>;
  enabled?: boolean;
};
export type SecuRuleCreateResponseData = {
  id: number;
  name: string;
  description: string | null;
  scope: string;
  trigger: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed" | "schedule";
  action: "start_playbook" | "tag_entity" | "notify_boss" | "create_finding";
  condition: Record<string, any> | null;
  actionParams: Record<string, any>;
  enabled: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  fireCount: number;
  lastFiredAt: string | null;
};
export type SecuRuleCreateResponse = import("../types").ApiEnvelope<SecuRuleCreateResponseData>;

export type SecuRuleUpdateParams = {
  id: number;
};
export type SecuRuleUpdateQuery = undefined;
export type SecuRuleUpdateBody = {
  name?: string;
  description?: string | null;
  scope?: string;
  trigger?: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed" | "schedule";
  action?: "start_playbook" | "tag_entity" | "notify_boss" | "create_finding";
  condition?: Record<string, any> | null;
  actionParams?: Record<string, any>;
  enabled?: boolean;
};
export type SecuRuleUpdateResponseData = {
  id: number;
  name: string;
  description: string | null;
  scope: string;
  trigger: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed" | "schedule";
  action: "start_playbook" | "tag_entity" | "notify_boss" | "create_finding";
  condition: Record<string, any> | null;
  actionParams: Record<string, any>;
  enabled: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  fireCount: number;
  lastFiredAt: string | null;
};
export type SecuRuleUpdateResponse = import("../types").ApiEnvelope<SecuRuleUpdateResponseData>;

export type SecuRuleDeleteParams = {
  id: number;
};
export type SecuRuleDeleteQuery = undefined;
export type SecuRuleDeleteBody = undefined;
export type SecuRuleDeleteResponseData = {
  ok: boolean;
};
export type SecuRuleDeleteResponse = import("../types").ApiEnvelope<SecuRuleDeleteResponseData>;

export const apiRoutes_secu_rules = {
  "secu_rule_list": {
    method: "GET",
    path: "/rules",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-rules"],
      summary: "List rules (filter by trigger, enabled, scope)",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SecuRuleListParams;
      query: SecuRuleListQuery;
      body: SecuRuleListBody;
      response: SecuRuleListResponse;
      responseData: SecuRuleListResponseData;
    },
  },
  "secu_rule_get": {
    method: "GET",
    path: "/rules/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-rules"],
      summary: "Get a single rule",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuRuleGetParams;
      query: SecuRuleGetQuery;
      body: SecuRuleGetBody;
      response: SecuRuleGetResponse;
      responseData: SecuRuleGetResponseData;
    },
  },
  "secu_rule_create": {
    method: "POST",
    path: "/rules",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-rules"],
      summary: "Create a declarative rule",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuRuleCreateParams;
      query: SecuRuleCreateQuery;
      body: SecuRuleCreateBody;
      response: SecuRuleCreateResponse;
      responseData: SecuRuleCreateResponseData;
    },
  },
  "secu_rule_update": {
    method: "PATCH",
    path: "/rules/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-rules"],
      summary: "Update a rule (incl. enable/disable — takes effect immediately)",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SecuRuleUpdateParams;
      query: SecuRuleUpdateQuery;
      body: SecuRuleUpdateBody;
      response: SecuRuleUpdateResponse;
      responseData: SecuRuleUpdateResponseData;
    },
  },
  "secu_rule_delete": {
    method: "DELETE",
    path: "/rules/:id",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["secu-rules"],
      summary: "Delete a rule",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: SecuRuleDeleteParams;
      query: SecuRuleDeleteQuery;
      body: SecuRuleDeleteBody;
      response: SecuRuleDeleteResponse;
      responseData: SecuRuleDeleteResponseData;
    },
  },
} as const;
// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-04T18:32:46.349Z
// Run `pnpm run api:generate` to regenerate

import type { Webhook } from "../../frontend-types";

export type WebhooksListParams = undefined;
export type WebhooksListQuery = {

};
export type WebhooksListBody = undefined;
export type WebhooksListResponseData = { webhooks: Webhook[]; canDelete: boolean };
export type WebhooksListResponse = import("../types").ApiEnvelope<WebhooksListResponseData>;

export type WebhooksDeleteParams = {
  webhookId: number;
};
export type WebhooksDeleteQuery = undefined;
export type WebhooksDeleteBody = undefined;
export type WebhooksDeleteResponseData = null;
export type WebhooksDeleteResponse = import("../types").ApiEnvelope<WebhooksDeleteResponseData>;

export type WebhooksDeleteBulkParams = {
  webhookIds: string;
};
export type WebhooksDeleteBulkQuery = undefined;
export type WebhooksDeleteBulkBody = undefined;
export type WebhooksDeleteBulkResponseData = null;
export type WebhooksDeleteBulkResponse = import("../types").ApiEnvelope<WebhooksDeleteBulkResponseData>;

export const apiRoutes_webhooks = {
  "webhooks_list": {
    method: "GET",
    path: "/webhooks/getAll",
    auth: {"type":"frontend_permission_http","permission":"webhook_view"},
    meta: {
      tags: ["webhooks"],
      summary: "List webhooks",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: WebhooksListParams;
      query: WebhooksListQuery;
      body: WebhooksListBody;
      response: WebhooksListResponse;
      responseData: WebhooksListResponseData;
    },
  },
  "webhooks_delete": {
    method: "DELETE",
    path: "/webhooks/delete/:webhookId",
    auth: {"type":"frontend_permission_http","permission":"webhook_delete"},
    meta: {
      tags: ["webhooks"],
      summary: "Delete one webhook",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: WebhooksDeleteParams;
      query: WebhooksDeleteQuery;
      body: WebhooksDeleteBody;
      response: WebhooksDeleteResponse;
      responseData: WebhooksDeleteResponseData;
    },
  },
  "webhooks_delete_bulk": {
    method: "DELETE",
    path: "/webhooks/delete/mass/:webhookIds",
    auth: {"type":"frontend_permission_http","permission":"webhook_delete"},
    meta: {
      tags: ["webhooks"],
      summary: "Delete multiple webhooks",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: WebhooksDeleteBulkParams;
      query: WebhooksDeleteBulkQuery;
      body: WebhooksDeleteBulkBody;
      response: WebhooksDeleteBulkResponse;
      responseData: WebhooksDeleteBulkResponseData;
    },
  },
} as const;
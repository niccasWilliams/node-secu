// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.139Z
// Run `pnpm run api:generate` to regenerate

import type { AppLog, PaginatedResult } from "../../frontend-types";

export type LogsSearchParams = undefined;
export type LogsSearchQuery = {
  search?: string;
  page?: number;
  pageSize?: number;
  level?: "debug" | "info" | "warn" | "error";
  dateFrom?: any;
  dateTo?: any;
};
export type LogsSearchBody = undefined;
export type LogsSearchResponseData = { logs: PaginatedResult<AppLog>; canDelete: boolean };
export type LogsSearchResponse = import("../types").ApiEnvelope<LogsSearchResponseData>;

export type LogsDeleteParams = {
  logId: number;
};
export type LogsDeleteQuery = undefined;
export type LogsDeleteBody = undefined;
export type LogsDeleteResponseData = null;
export type LogsDeleteResponse = import("../types").ApiEnvelope<LogsDeleteResponseData>;

export type LogsDeleteBulkParams = {
  logIds: string;
};
export type LogsDeleteBulkQuery = undefined;
export type LogsDeleteBulkBody = undefined;
export type LogsDeleteBulkResponseData = null;
export type LogsDeleteBulkResponse = import("../types").ApiEnvelope<LogsDeleteBulkResponseData>;

export const apiRoutes_logs = {
  "logs_search": {
    method: "GET",
    path: "/app-logs/search",
    auth: {"type":"frontend_permission_http","permission":"log_view"},
    meta: {
      tags: ["logs"],
      summary: "Search logs",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: LogsSearchParams;
      query: LogsSearchQuery;
      body: LogsSearchBody;
      response: LogsSearchResponse;
      responseData: LogsSearchResponseData;
    },
  },
  "logs_delete": {
    method: "DELETE",
    path: "/app-logs/delete/:logId",
    auth: {"type":"frontend_permission_http","permission":"log_delete"},
    meta: {
      tags: ["logs"],
      summary: "Delete one log",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: LogsDeleteParams;
      query: LogsDeleteQuery;
      body: LogsDeleteBody;
      response: LogsDeleteResponse;
      responseData: LogsDeleteResponseData;
    },
  },
  "logs_delete_bulk": {
    method: "DELETE",
    path: "/app-logs/delete/mass/:logIds",
    auth: {"type":"frontend_permission_http","permission":"log_delete"},
    meta: {
      tags: ["logs"],
      summary: "Delete multiple logs",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: LogsDeleteBulkParams;
      query: LogsDeleteBulkQuery;
      body: LogsDeleteBulkBody;
      response: LogsDeleteBulkResponse;
      responseData: LogsDeleteBulkResponseData;
    },
  },
} as const;
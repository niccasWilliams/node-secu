// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-04T18:32:46.348Z
// Run `pnpm run api:generate` to regenerate

import type { PaginatedUsersWithActivityOverview, UserWithStats } from "../../frontend-types";

export type UserActivityUsersStatsListParams = undefined;
export type UserActivityUsersStatsListQuery = {

};
export type UserActivityUsersStatsListBody = undefined;
export type UserActivityUsersStatsListResponseData = UserWithStats[];
export type UserActivityUsersStatsListResponse = import("../types").ApiEnvelope<UserActivityUsersStatsListResponseData>;

export type UserActivityOverviewGetParams = {
  userId: number;
};
export type UserActivityOverviewGetQuery = undefined;
export type UserActivityOverviewGetBody = {
  search?: string;
  page?: number;
  resultsPerPage?: number;
  statusCodes?: Array<number>;
  date?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
};
export type UserActivityOverviewGetResponseData = PaginatedUsersWithActivityOverview;
export type UserActivityOverviewGetResponse = import("../types").ApiEnvelope<UserActivityOverviewGetResponseData>;

export const apiRoutes_user_activity = {
  "user_activity_users_stats_list": {
    method: "GET",
    path: "/user-activity/users",
    auth: {"type":"frontend_permission_http","permission":"users_view"},
    meta: {
      tags: ["user-activity"],
      summary: "List users with activity stats",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: UserActivityUsersStatsListParams;
      query: UserActivityUsersStatsListQuery;
      body: UserActivityUsersStatsListBody;
      response: UserActivityUsersStatsListResponse;
      responseData: UserActivityUsersStatsListResponseData;
    },
  },
  "user_activity_overview_get": {
    method: "POST",
    path: "/user-activity/user/:userId",
    auth: {"type":"frontend_permission_http","permission":"users_view"},
    meta: {
      tags: ["user-activity"],
      summary: "Get detailed activity overview for a user",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: UserActivityOverviewGetParams;
      query: UserActivityOverviewGetQuery;
      body: UserActivityOverviewGetBody;
      response: UserActivityOverviewGetResponse;
      responseData: UserActivityOverviewGetResponseData;
    },
  },
} as const;
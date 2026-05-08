// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.141Z
// Run `pnpm run api:generate` to regenerate

import type { NodeTemplateUser, PaginatedResult } from "../../frontend-types";

export type UsersCreateParams = undefined;
export type UsersCreateQuery = undefined;
export type UsersCreateBody = {
  externalUserId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
};
export type UsersCreateResponseData = NodeTemplateUser;
export type UsersCreateResponse = import("../types").ApiEnvelope<UsersCreateResponseData>;

export type UsersDeleteExternalParams = {
  frontendUserId: number;
};
export type UsersDeleteExternalQuery = undefined;
export type UsersDeleteExternalBody = undefined;
export type UsersDeleteExternalResponseData = NodeTemplateUser;
export type UsersDeleteExternalResponse = import("../types").ApiEnvelope<UsersDeleteExternalResponseData>;

export type UsersUpdateExternalParams = {
  frontendUserId: number;
};
export type UsersUpdateExternalQuery = undefined;
export type UsersUpdateExternalBody = {
  firstName?: string;
  lastName?: string;
};
export type UsersUpdateExternalResponseData = NodeTemplateUser;
export type UsersUpdateExternalResponse = import("../types").ApiEnvelope<UsersUpdateExternalResponseData>;

export type UsersDeleteParams = {
  userId: number;
};
export type UsersDeleteQuery = undefined;
export type UsersDeleteBody = undefined;
export type UsersDeleteResponseData = NodeTemplateUser;
export type UsersDeleteResponse = import("../types").ApiEnvelope<UsersDeleteResponseData>;

export type UsersListParams = undefined;
export type UsersListQuery = {

};
export type UsersListBody = undefined;
export type UsersListResponseData = NodeTemplateUser[];
export type UsersListResponse = import("../types").ApiEnvelope<UsersListResponseData>;

export type UsersGetByEmailParams = {
  email: string;
};
export type UsersGetByEmailQuery = undefined;
export type UsersGetByEmailBody = undefined;
export type UsersGetByEmailResponseData = NodeTemplateUser;
export type UsersGetByEmailResponse = import("../types").ApiEnvelope<UsersGetByEmailResponseData>;

export type UsersGetByExternalUserIdParams = {
  externalUserId: number;
};
export type UsersGetByExternalUserIdQuery = undefined;
export type UsersGetByExternalUserIdBody = undefined;
export type UsersGetByExternalUserIdResponseData = NodeTemplateUser;
export type UsersGetByExternalUserIdResponse = import("../types").ApiEnvelope<UsersGetByExternalUserIdResponseData>;

export type UsersGetByIdParams = {
  userId: number;
};
export type UsersGetByIdQuery = {

};
export type UsersGetByIdBody = undefined;
export type UsersGetByIdResponseData = NodeTemplateUser;
export type UsersGetByIdResponse = import("../types").ApiEnvelope<UsersGetByIdResponseData>;

export type UsersSearchParams = undefined;
export type UsersSearchQuery = {
  search?: string;
  page?: number;
  pageSize?: number;
};
export type UsersSearchBody = undefined;
export type UsersSearchResponseData = PaginatedResult<NodeTemplateUser>;
export type UsersSearchResponse = import("../types").ApiEnvelope<UsersSearchResponseData>;

export const apiRoutes_users = {
  "users_create": {
    method: "POST",
    path: "/users/create",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["users"],
      summary: "Create user",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: UsersCreateParams;
      query: UsersCreateQuery;
      body: UsersCreateBody;
      response: UsersCreateResponse;
      responseData: UsersCreateResponseData;
    },
  },
  "users_delete_external": {
    method: "DELETE",
    path: "/users/delete/external/:frontendUserId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["users"],
      summary: "Delete own user via external user id",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: UsersDeleteExternalParams;
      query: UsersDeleteExternalQuery;
      body: UsersDeleteExternalBody;
      response: UsersDeleteExternalResponse;
      responseData: UsersDeleteExternalResponseData;
    },
  },
  "users_update_external": {
    method: "PUT",
    path: "/users/update/external/:frontendUserId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["users"],
      summary: "Update own user profile via external user id",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: UsersUpdateExternalParams;
      query: UsersUpdateExternalQuery;
      body: UsersUpdateExternalBody;
      response: UsersUpdateExternalResponse;
      responseData: UsersUpdateExternalResponseData;
    },
  },
  "users_delete": {
    method: "DELETE",
    path: "/users/delete/:userId",
    auth: {"type":"frontend_permission_http","permission":"users_manage"},
    meta: {
      tags: ["users"],
      summary: "Delete user by internal id",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: UsersDeleteParams;
      query: UsersDeleteQuery;
      body: UsersDeleteBody;
      response: UsersDeleteResponse;
      responseData: UsersDeleteResponseData;
    },
  },
  "users_list": {
    method: "GET",
    path: "/users/getAll",
    auth: {"type":"frontend_permission_http","permission":"users_view"},
    meta: {
      tags: ["users"],
      summary: "List all users",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: UsersListParams;
      query: UsersListQuery;
      body: UsersListBody;
      response: UsersListResponse;
      responseData: UsersListResponseData;
    },
  },
  "users_get_by_email": {
    method: "GET",
    path: "/users/getByEmail/:email",
    auth: {"type":"frontend_permission_http","permission":"users_view"},
    meta: {
      tags: ["users"],
      summary: "Get user by email",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: UsersGetByEmailParams;
      query: UsersGetByEmailQuery;
      body: UsersGetByEmailBody;
      response: UsersGetByEmailResponse;
      responseData: UsersGetByEmailResponseData;
    },
  },
  "users_get_by_external_user_id": {
    method: "GET",
    path: "/users/getByExternalUserId/:externalUserId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["users"],
      summary: "Get user by external user id",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: UsersGetByExternalUserIdParams;
      query: UsersGetByExternalUserIdQuery;
      body: UsersGetByExternalUserIdBody;
      response: UsersGetByExternalUserIdResponse;
      responseData: UsersGetByExternalUserIdResponseData;
    },
  },
  "users_get_by_id": {
    method: "GET",
    path: "/users/getById/:userId",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["users"],
      summary: "Get user by internal id",
      description: "Controller enforces self-access or `users_view` permission.",
      validated: {"params":true,"query":true,"body":false},
    },
    types: null as unknown as {
      params: UsersGetByIdParams;
      query: UsersGetByIdQuery;
      body: UsersGetByIdBody;
      response: UsersGetByIdResponse;
      responseData: UsersGetByIdResponseData;
    },
  },
  "users_search": {
    method: "GET",
    path: "/users/search",
    auth: {"type":"frontend_permission_http","permission":"users_view"},
    meta: {
      tags: ["users"],
      summary: "Search users",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: UsersSearchParams;
      query: UsersSearchQuery;
      body: UsersSearchBody;
      response: UsersSearchResponse;
      responseData: UsersSearchResponseData;
    },
  },
} as const;
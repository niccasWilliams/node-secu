// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.139Z
// Run `pnpm run api:generate` to regenerate

import type { Permission, RolePermission } from "../../frontend-types";

export type PermissionsCreateParams = undefined;
export type PermissionsCreateQuery = undefined;
export type PermissionsCreateBody = {
  name: string;
  description: string;
};
export type PermissionsCreateResponseData = Permission;
export type PermissionsCreateResponse = import("../types").ApiEnvelope<PermissionsCreateResponseData>;

export type PermissionsSyncParams = undefined;
export type PermissionsSyncQuery = {

};
export type PermissionsSyncBody = undefined;
export type PermissionsSyncResponseData = { created: Permission[]; existing: Permission[]; total: number };
export type PermissionsSyncResponse = import("../types").ApiEnvelope<PermissionsSyncResponseData>;

export type PermissionsListParams = undefined;
export type PermissionsListQuery = {

};
export type PermissionsListBody = undefined;
export type PermissionsListResponseData = Permission[];
export type PermissionsListResponse = import("../types").ApiEnvelope<PermissionsListResponseData>;

export type PermissionsAssignToRoleParams = {
  roleId: number;
  permissionId: number;
};
export type PermissionsAssignToRoleQuery = undefined;
export type PermissionsAssignToRoleBody = undefined;
export type PermissionsAssignToRoleResponseData = null;
export type PermissionsAssignToRoleResponse = import("../types").ApiEnvelope<PermissionsAssignToRoleResponseData>;

export type PermissionsUnassignFromRoleParams = {
  roleId: number;
  permissionId: number;
};
export type PermissionsUnassignFromRoleQuery = undefined;
export type PermissionsUnassignFromRoleBody = undefined;
export type PermissionsUnassignFromRoleResponseData = null;
export type PermissionsUnassignFromRoleResponse = import("../types").ApiEnvelope<PermissionsUnassignFromRoleResponseData>;

export type PermissionsAssignmentsListParams = undefined;
export type PermissionsAssignmentsListQuery = {

};
export type PermissionsAssignmentsListBody = undefined;
export type PermissionsAssignmentsListResponseData = RolePermission[];
export type PermissionsAssignmentsListResponse = import("../types").ApiEnvelope<PermissionsAssignmentsListResponseData>;

export const apiRoutes_permissions = {
  "permissions_create": {
    method: "POST",
    path: "/permissions/create",
    auth: {"type":"frontend_permission_http","permission":"permissions_manage"},
    meta: {
      tags: ["permissions"],
      summary: "Create permission",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: PermissionsCreateParams;
      query: PermissionsCreateQuery;
      body: PermissionsCreateBody;
      response: PermissionsCreateResponse;
      responseData: PermissionsCreateResponseData;
    },
  },
  "permissions_sync": {
    method: "POST",
    path: "/permissions/sync",
    auth: {"type":"frontend_permission_http","permission":"permissions_manage"},
    meta: {
      tags: ["permissions"],
      summary: "Sync default permissions",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: PermissionsSyncParams;
      query: PermissionsSyncQuery;
      body: PermissionsSyncBody;
      response: PermissionsSyncResponse;
      responseData: PermissionsSyncResponseData;
    },
  },
  "permissions_list": {
    method: "GET",
    path: "/permissions/getAll",
    auth: {"type":"frontend_permission_http","permission":"permissions_manage"},
    meta: {
      tags: ["permissions"],
      summary: "List permissions",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: PermissionsListParams;
      query: PermissionsListQuery;
      body: PermissionsListBody;
      response: PermissionsListResponse;
      responseData: PermissionsListResponseData;
    },
  },
  "permissions_assign_to_role": {
    method: "POST",
    path: "/permissions/assign/:roleId/:permissionId",
    auth: {"type":"frontend_permission_http","permission":"permissions_manage"},
    meta: {
      tags: ["permissions"],
      summary: "Assign permission to role",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: PermissionsAssignToRoleParams;
      query: PermissionsAssignToRoleQuery;
      body: PermissionsAssignToRoleBody;
      response: PermissionsAssignToRoleResponse;
      responseData: PermissionsAssignToRoleResponseData;
    },
  },
  "permissions_unassign_from_role": {
    method: "DELETE",
    path: "/permissions/unassign/:roleId/:permissionId",
    auth: {"type":"frontend_permission_http","permission":"permissions_manage"},
    meta: {
      tags: ["permissions"],
      summary: "Unassign permission from role",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: PermissionsUnassignFromRoleParams;
      query: PermissionsUnassignFromRoleQuery;
      body: PermissionsUnassignFromRoleBody;
      response: PermissionsUnassignFromRoleResponse;
      responseData: PermissionsUnassignFromRoleResponseData;
    },
  },
  "permissions_assignments_list": {
    method: "GET",
    path: "/permissions/getAssignments",
    auth: {"type":"composite_and","items":[{"type":"frontend_permission_http","permission":"permissions_manage"},{"type":"frontend_permission_http","permission":"permissions_history_view"}]},
    meta: {
      tags: ["permissions"],
      summary: "List role-permission assignments",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: PermissionsAssignmentsListParams;
      query: PermissionsAssignmentsListQuery;
      body: PermissionsAssignmentsListBody;
      response: PermissionsAssignmentsListResponse;
      responseData: PermissionsAssignmentsListResponseData;
    },
  },
} as const;
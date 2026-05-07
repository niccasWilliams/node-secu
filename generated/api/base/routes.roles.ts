// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-04T18:32:46.348Z
// Run `pnpm run api:generate` to regenerate

import type { Permission, Role, RoleAssignment, RolePermission } from "../../frontend-types";

export type RolesCreateParams = undefined;
export type RolesCreateQuery = undefined;
export type RolesCreateBody = {
  name: string;
  description: string;
  isSellable?: boolean;
};
export type RolesCreateResponseData = null;
export type RolesCreateResponse = import("../types").ApiEnvelope<RolesCreateResponseData>;

export type RolesDeleteParams = {
  roleId: number;
};
export type RolesDeleteQuery = undefined;
export type RolesDeleteBody = undefined;
export type RolesDeleteResponseData = Role;
export type RolesDeleteResponse = import("../types").ApiEnvelope<RolesDeleteResponseData>;

export type RolesUpdateParams = {
  roleId: number;
};
export type RolesUpdateQuery = undefined;
export type RolesUpdateBody = {
  name: string;
  description: string;
};
export type RolesUpdateResponseData = Role;
export type RolesUpdateResponse = import("../types").ApiEnvelope<RolesUpdateResponseData>;

export type RolesGetByIdParams = {
  roleId: number;
};
export type RolesGetByIdQuery = undefined;
export type RolesGetByIdBody = undefined;
export type RolesGetByIdResponseData = Role;
export type RolesGetByIdResponse = import("../types").ApiEnvelope<RolesGetByIdResponseData>;

export type RolesListParams = undefined;
export type RolesListQuery = {

};
export type RolesListBody = undefined;
export type RolesListResponseData = { roles: Role[]; roleAssignments: RoleAssignment[]; permissions: Permission[]; rolePermissions: RolePermission[]; canSeeHistory: boolean };
export type RolesListResponse = import("../types").ApiEnvelope<RolesListResponseData>;

export type RoleAssignmentsCreateParams = {
  userId: number;
  roleId: number;
};
export type RoleAssignmentsCreateQuery = undefined;
export type RoleAssignmentsCreateBody = {
  validFrom?: string;
};
export type RoleAssignmentsCreateResponseData = RoleAssignment;
export type RoleAssignmentsCreateResponse = import("../types").ApiEnvelope<RoleAssignmentsCreateResponseData>;

export type RoleAssignmentsRevokeParams = {
  userId: number;
  roleId: number;
};
export type RoleAssignmentsRevokeQuery = undefined;
export type RoleAssignmentsRevokeBody = undefined;
export type RoleAssignmentsRevokeResponseData = null;
export type RoleAssignmentsRevokeResponse = import("../types").ApiEnvelope<RoleAssignmentsRevokeResponseData>;

export type RoleAssignmentsListParams = undefined;
export type RoleAssignmentsListQuery = {

};
export type RoleAssignmentsListBody = undefined;
export type RoleAssignmentsListResponseData = RoleAssignment[];
export type RoleAssignmentsListResponse = import("../types").ApiEnvelope<RoleAssignmentsListResponseData>;

export type RoleAssignmentsGetUserAssignmentsParams = {
  userId: number;
};
export type RoleAssignmentsGetUserAssignmentsQuery = undefined;
export type RoleAssignmentsGetUserAssignmentsBody = undefined;
export type RoleAssignmentsGetUserAssignmentsResponseData = RoleAssignment[];
export type RoleAssignmentsGetUserAssignmentsResponse = import("../types").ApiEnvelope<RoleAssignmentsGetUserAssignmentsResponseData>;

export const apiRoutes_roles = {
  "roles_create": {
    method: "POST",
    path: "/roles/create",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles"],
      summary: "Create role",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: RolesCreateParams;
      query: RolesCreateQuery;
      body: RolesCreateBody;
      response: RolesCreateResponse;
      responseData: RolesCreateResponseData;
    },
  },
  "roles_delete": {
    method: "DELETE",
    path: "/roles/delete/:roleId",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles"],
      summary: "Delete role",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: RolesDeleteParams;
      query: RolesDeleteQuery;
      body: RolesDeleteBody;
      response: RolesDeleteResponse;
      responseData: RolesDeleteResponseData;
    },
  },
  "roles_update": {
    method: "PUT",
    path: "/roles/update/:roleId",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles"],
      summary: "Update role",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: RolesUpdateParams;
      query: RolesUpdateQuery;
      body: RolesUpdateBody;
      response: RolesUpdateResponse;
      responseData: RolesUpdateResponseData;
    },
  },
  "roles_get_by_id": {
    method: "GET",
    path: "/roles/getById/:roleId",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles"],
      summary: "Get role by id",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: RolesGetByIdParams;
      query: RolesGetByIdQuery;
      body: RolesGetByIdBody;
      response: RolesGetByIdResponse;
      responseData: RolesGetByIdResponseData;
    },
  },
  "roles_list": {
    method: "GET",
    path: "/roles/getAll",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles"],
      summary: "Get role base data",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: RolesListParams;
      query: RolesListQuery;
      body: RolesListBody;
      response: RolesListResponse;
      responseData: RolesListResponseData;
    },
  },
  "role_assignments_create": {
    method: "POST",
    path: "/role-assignments/create/:userId/:roleId",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles","role-assignments"],
      summary: "Assign role to user",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: RoleAssignmentsCreateParams;
      query: RoleAssignmentsCreateQuery;
      body: RoleAssignmentsCreateBody;
      response: RoleAssignmentsCreateResponse;
      responseData: RoleAssignmentsCreateResponseData;
    },
  },
  "role_assignments_revoke": {
    method: "DELETE",
    path: "/role-assignments/delete/:userId/:roleId",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles","role-assignments"],
      summary: "Revoke role from user",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: RoleAssignmentsRevokeParams;
      query: RoleAssignmentsRevokeQuery;
      body: RoleAssignmentsRevokeBody;
      response: RoleAssignmentsRevokeResponse;
      responseData: RoleAssignmentsRevokeResponseData;
    },
  },
  "role_assignments_list": {
    method: "GET",
    path: "/role-assignments/getAll",
    auth: {"type":"frontend_permission_http","permission":"roles_history_view"},
    meta: {
      tags: ["roles","role-assignments"],
      summary: "List all role assignments",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: RoleAssignmentsListParams;
      query: RoleAssignmentsListQuery;
      body: RoleAssignmentsListBody;
      response: RoleAssignmentsListResponse;
      responseData: RoleAssignmentsListResponseData;
    },
  },
  "role_assignments_get_user_assignments": {
    method: "GET",
    path: "/role-assignments/getUserAssignments/:userId",
    auth: {"type":"frontend_permission_http","permission":"roles_manage"},
    meta: {
      tags: ["roles","role-assignments"],
      summary: "List active role assignments for one user",
      validated: {"params":true,"query":false,"body":false},
    },
    types: null as unknown as {
      params: RoleAssignmentsGetUserAssignmentsParams;
      query: RoleAssignmentsGetUserAssignmentsQuery;
      body: RoleAssignmentsGetUserAssignmentsBody;
      response: RoleAssignmentsGetUserAssignmentsResponse;
      responseData: RoleAssignmentsGetUserAssignmentsResponseData;
    },
  },
} as const;
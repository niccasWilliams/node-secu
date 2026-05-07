import { Router } from "express";

import { AccessControl } from "@/routes/middleware";
import { roleAssignmentController } from "./role-assignment.controller";
import { AppPermissions } from "../permissions/permission.service";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import {
  roleAssignmentCreateBodySchema,
  roleAssignmentListQuerySchema,
  roleAssignmentUserIdParamSchema,
  roleAssignmentUserRoleParamsSchema,
} from "./role-assignment.dto";

const c = createContractRouter("/role-assignments", { tags: ["roles", "role-assignments"] });
const router: Router = c.router;

c.post(
  "/create/:userId/:roleId",
  AccessControl.hasPermission(AppPermissions.RolesManage),
  validate({ params: roleAssignmentUserRoleParamsSchema, body: roleAssignmentCreateBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "role_assignments_create",
    summary: "Assign role to user",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { params: roleAssignmentUserRoleParamsSchema, body: roleAssignmentCreateBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 201, data: typeRefExpr("RoleAssignment", ["RoleAssignment"]) }],
  }),
  roleAssignmentController.createRoleAssignment
);

c.delete(
  "/delete/:userId/:roleId",
  AccessControl.hasPermission(AppPermissions.RolesManage),
  validate({ params: roleAssignmentUserRoleParamsSchema }),
  contract({
    operationId: "role_assignments_revoke",
    summary: "Revoke role from user",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { params: roleAssignmentUserRoleParamsSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  roleAssignmentController.revokeUserFromRole
);

c.get(
  "/getAll",
  AccessControl.hasPermission(AppPermissions.RolesHistoryView),
  validate({ query: roleAssignmentListQuerySchema }),
  contract({
    operationId: "role_assignments_list",
    summary: "List all role assignments",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesHistoryView },
    request: { query: roleAssignmentListQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("RoleAssignment[]", ["RoleAssignment"]) }],
  }),
  roleAssignmentController.getAllRoleAssignments
);

c.get(
  "/getUserAssignments/:userId",
  AccessControl.hasPermission(AppPermissions.RolesManage),
  validate({ params: roleAssignmentUserIdParamSchema }),
  contract({
    operationId: "role_assignments_get_user_assignments",
    summary: "List active role assignments for one user",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { params: roleAssignmentUserIdParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("RoleAssignment[]", ["RoleAssignment"]) }],
  }),
  roleAssignmentController.getUserRoleAssignments
);

export default router;

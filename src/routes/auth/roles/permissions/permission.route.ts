import { Router } from "express";
import { permissionController } from "./permission.controller";
import { AccessControl } from "@/routes/middleware";
import { AppPermissions } from "./permission.service";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import {
  permissionCreateBodySchema,
  permissionRoleAssignmentParamsSchema,
  permissionsListQuerySchema,
} from "./permission.dto";

const c = createContractRouter("/permissions", { tags: ["permissions"] });
const router: Router = c.router;

router.use(AccessControl.hasPermission(AppPermissions.PermissionsManage));

c.post(
  "/create",
  validate({ body: permissionCreateBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "permissions_create",
    summary: "Create permission",
    auth: { type: "frontend_permission_http", permission: AppPermissions.PermissionsManage },
    request: { body: permissionCreateBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 201, data: typeRefExpr("Permission", ["Permission"]) }],
  }),
  permissionController.createPermission
);

c.post(
  "/sync",
  validate({ query: permissionsListQuerySchema }),
  contract({
    operationId: "permissions_sync",
    summary: "Sync default permissions",
    auth: { type: "frontend_permission_http", permission: AppPermissions.PermissionsManage },
    request: { query: permissionsListQuerySchema },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr("{ created: Permission[]; existing: Permission[]; total: number }", ["Permission"]),
      },
    ],
  }),
  permissionController.syncPermissions
);

c.get(
  "/getAll",
  validate({ query: permissionsListQuerySchema }),
  contract({
    operationId: "permissions_list",
    summary: "List permissions",
    auth: { type: "frontend_permission_http", permission: AppPermissions.PermissionsManage },
    request: { query: permissionsListQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("Permission[]", ["Permission"]) }],
  }),
  permissionController.getAllPermissions
);

c.post(
  "/assign/:roleId/:permissionId",
  validate({ params: permissionRoleAssignmentParamsSchema }),
  contract({
    operationId: "permissions_assign_to_role",
    summary: "Assign permission to role",
    auth: { type: "frontend_permission_http", permission: AppPermissions.PermissionsManage },
    request: { params: permissionRoleAssignmentParamsSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  permissionController.assignPermissionToRole
);

c.delete(
  "/unassign/:roleId/:permissionId",
  validate({ params: permissionRoleAssignmentParamsSchema }),
  contract({
    operationId: "permissions_unassign_from_role",
    summary: "Unassign permission from role",
    auth: { type: "frontend_permission_http", permission: AppPermissions.PermissionsManage },
    request: { params: permissionRoleAssignmentParamsSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  permissionController.unassignPermissionFromRole
);

c.get(
  "/getAssignments",
  AccessControl.hasPermission(AppPermissions.PermissionsHistoryView),
  validate({ query: permissionsListQuerySchema }),
  contract({
    operationId: "permissions_assignments_list",
    summary: "List role-permission assignments",
    auth: {
      type: "composite_and",
      items: [
        { type: "frontend_permission_http", permission: AppPermissions.PermissionsManage },
        { type: "frontend_permission_http", permission: AppPermissions.PermissionsHistoryView },
      ],
    },
    request: { query: permissionsListQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("RolePermission[]", ["RolePermission"]) }],
  }),
  permissionController.getAssignments
);

export default router;

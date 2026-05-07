import { Router } from "express";
import { roleController } from "./role.controller";
import { AccessControl } from "@/routes/middleware";
import { AppPermissions } from "../permissions/permission.service";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import {
  roleCreateBodySchema,
  roleIdParamSchema,
  rolesListQuerySchema,
  roleUpdateBodySchema,
} from "./role.dto";

const c = createContractRouter("/roles", { tags: ["roles"] });
const router: Router = c.router;

router.use(AccessControl.hasPermission(AppPermissions.RolesManage));

c.post(
  "/create",
  validate({ body: roleCreateBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "roles_create",
    summary: "Create role",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { body: roleCreateBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 201, data: require("zod").null() }],
  }),
  roleController.createRole
);

c.delete(
  "/delete/:roleId",
  validate({ params: roleIdParamSchema }),
  contract({
    operationId: "roles_delete",
    summary: "Delete role",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { params: roleIdParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("Role", ["Role"]) }],
  }),
  roleController.deleteRole
);

c.put(
  "/update/:roleId",
  validate({ params: roleIdParamSchema, body: roleUpdateBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "roles_update",
    summary: "Update role",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { params: roleIdParamSchema, body: roleUpdateBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("Role", ["Role"]) }],
  }),
  roleController.updateRole
);

c.get(
  "/getById/:roleId",
  validate({ params: roleIdParamSchema }),
  contract({
    operationId: "roles_get_by_id",
    summary: "Get role by id",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { params: roleIdParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("Role", ["Role"]) }],
  }),
  roleController.getRoleById
);

c.get(
  "/getAll",
  validate({ query: rolesListQuerySchema }),
  contract({
    operationId: "roles_list",
    summary: "Get role base data",
    auth: { type: "frontend_permission_http", permission: AppPermissions.RolesManage },
    request: { query: rolesListQuerySchema },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr(
          "{ roles: Role[]; roleAssignments: RoleAssignment[]; permissions: Permission[]; rolePermissions: RolePermission[]; canSeeHistory: boolean }",
          ["Role", "RoleAssignment", "Permission", "RolePermission"]
        ),
      },
    ],
  }),
  roleController.getAllRoles
);

export default router;

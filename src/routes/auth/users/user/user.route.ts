import { Router } from "express";
import { userController } from "@/routes/auth/users/user/user.controller";
import { AccessControl } from "@/routes/middleware";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import {
  createUserBodySchema,
  emptyQuerySchema,
  externalUserIdParamSchema,
  frontendUserIdParamSchema,
  searchUsersQuerySchema,
  updateUserBodySchema,
  userEmailParamSchema,
  userIdParamSchema,
} from "./user.dto";

const c = createContractRouter("/users", { tags: ["users"] });
const router: Router = c.router;

c.post(
  "/create",
  AccessControl.isFrontendRequest,
  validate({ body: createUserBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "users_create",
    summary: "Create user",
    auth: { type: "frontend_bearer_http" },
    request: { body: createUserBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser", ["NodeTemplateUser"]) }],
  }),
  userController.createUser
);

c.delete(
  "/delete/external/:frontendUserId",
  AccessControl.isAuthUser(),
  validate({ params: frontendUserIdParamSchema }),
  contract({
    operationId: "users_delete_external",
    summary: "Delete own user via external user id",
    auth: { type: "frontend_bearer_http" },
    request: { params: frontendUserIdParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser", ["NodeTemplateUser"]) }],
  }),
  userController.deleteFrontendUser
);

c.put(
  "/update/external/:frontendUserId",
  AccessControl.isAuthUser(),
  validate({ params: frontendUserIdParamSchema, body: updateUserBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "users_update_external",
    summary: "Update own user profile via external user id",
    auth: { type: "frontend_bearer_http" },
    request: { params: frontendUserIdParamSchema, body: updateUserBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser", ["NodeTemplateUser"]) }],
  }),
  userController.updateUser
);

c.delete(
  "/delete/:userId",
  AccessControl.hasPermission(AppPermissions.UsersManage),
  validate({ params: userIdParamSchema }),
  contract({
    operationId: "users_delete",
    summary: "Delete user by internal id",
    auth: { type: "frontend_permission_http", permission: AppPermissions.UsersManage },
    request: { params: userIdParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser", ["NodeTemplateUser"]) }],
  }),
  userController.deleteUser
);

c.get(
  "/getAll",
  AccessControl.hasPermission(AppPermissions.UsersView),
  validate({ query: emptyQuerySchema }),
  contract({
    operationId: "users_list",
    summary: "List all users",
    auth: { type: "frontend_permission_http", permission: AppPermissions.UsersView },
    request: { query: emptyQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser[]", ["NodeTemplateUser"]) }],
  }),
  userController.getAllUsers
);

c.get(
  "/getByEmail/:email",
  AccessControl.hasPermission(AppPermissions.UsersView),
  validate({ params: userEmailParamSchema }),
  contract({
    operationId: "users_get_by_email",
    summary: "Get user by email",
    auth: { type: "frontend_permission_http", permission: AppPermissions.UsersView },
    request: { params: userEmailParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser", ["NodeTemplateUser"]) }],
  }),
  userController.getUserByEmail
);

c.get(
  "/getByExternalUserId/:externalUserId",
  AccessControl.isFrontendRequest,
  validate({ params: externalUserIdParamSchema }),
  contract({
    operationId: "users_get_by_external_user_id",
    summary: "Get user by external user id",
    auth: { type: "frontend_bearer_http" },
    request: { params: externalUserIdParamSchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser", ["NodeTemplateUser"]) }],
  }),
  userController.getUserByExternalUserId
);

c.get(
  "/getById/:userId",
  validate({ params: userIdParamSchema, query: emptyQuerySchema }),
  contract({
    operationId: "users_get_by_id",
    summary: "Get user by internal id",
    description: "Controller enforces self-access or `users_view` permission.",
    auth: { type: "frontend_bearer_http" },
    request: { params: userIdParamSchema, query: emptyQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("NodeTemplateUser", ["NodeTemplateUser"]) }],
  }),
  userController.getUserById
);

c.get(
  "/search",
  AccessControl.hasPermission(AppPermissions.UsersView),
  validate({ query: searchUsersQuerySchema }),
  contract({
    operationId: "users_search",
    summary: "Search users",
    auth: { type: "frontend_permission_http", permission: AppPermissions.UsersView },
    request: { query: searchUsersQuerySchema },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr("PaginatedResult<NodeTemplateUser>", ["PaginatedResult", "NodeTemplateUser"]),
      },
    ],
  }),
  userController.searchUsers
);

export default router;

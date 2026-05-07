import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { userActivityController } from "./user-activity.controller";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRef, typeRefExpr } from "@/api-contract/type-ref";
import {
  userActivityOverviewBodySchema,
  userActivityUserIdParamSchema,
  userActivityUsersQuerySchema,
} from "./user-activity.dto";

const c = createContractRouter("/user-activity", { tags: ["user-activity"] });
const router: Router = c.router;

c.get(
  "/users",
  AccessControl.hasPermission(AppPermissions.UsersView),
  validate({ query: userActivityUsersQuerySchema }),
  contract({
    operationId: "user_activity_users_stats_list",
    summary: "List users with activity stats",
    auth: { type: "frontend_permission_http", permission: AppPermissions.UsersView },
    request: { query: userActivityUsersQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("UserWithStats[]", ["UserWithStats"]) }],
  }),
  userActivityController.getAllUsersWithActivityStats
);

c.post(
  "/user/:userId",
  AccessControl.hasPermission(AppPermissions.UsersView),
  validate({ params: userActivityUserIdParamSchema, body: userActivityOverviewBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "user_activity_overview_get",
    summary: "Get detailed activity overview for a user",
    auth: { type: "frontend_permission_http", permission: AppPermissions.UsersView },
    request: { params: userActivityUserIdParamSchema, body: userActivityOverviewBodySchema, bodyContentType: "application/json" },
    responses: [
      { kind: "json", status: 200, data: typeRef("PaginatedUsersWithActivityOverview") },
    ],
  }),
  userActivityController.getUserActivityOverview
);

export default router;

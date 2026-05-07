import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { logServiceController } from "./log-service.controller";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import { logIdParamSchema, logIdsParamSchema, logSearchQuerySchema } from "./log-service.dto";

const c = createContractRouter("/app-logs", { tags: ["logs"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
  "/search",
  AccessControl.hasPermission(AppPermissions.LogView),
  validate({ query: logSearchQuerySchema }),
  contract({
    operationId: "logs_search",
    summary: "Search logs",
    auth: { type: "frontend_permission_http", permission: AppPermissions.LogView },
    request: { query: logSearchQuerySchema },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr("{ logs: PaginatedResult<AppLog>; canDelete: boolean }", ["PaginatedResult", "AppLog"]),
      },
    ],
  }),
  logServiceController.searchLogs
);

c.delete(
  "/delete/:logId",
  AccessControl.hasPermission(AppPermissions.LogDelete),
  validate({ params: logIdParamSchema }),
  contract({
    operationId: "logs_delete",
    summary: "Delete one log",
    auth: { type: "frontend_permission_http", permission: AppPermissions.LogDelete },
    request: { params: logIdParamSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  logServiceController.deleteLog
);

c.delete(
  "/delete/mass/:logIds",
  AccessControl.hasPermission(AppPermissions.LogDelete),
  validate({ params: logIdsParamSchema }),
  contract({
    operationId: "logs_delete_bulk",
    summary: "Delete multiple logs",
    auth: { type: "frontend_permission_http", permission: AppPermissions.LogDelete },
    request: { params: logIdsParamSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  logServiceController.deleteLogs
);

export default router;

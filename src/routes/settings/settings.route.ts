import { Router } from "express";

import { AccessControl } from "@/routes/middleware";
import { settingsController } from "@/routes/settings/settings.controller";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import {
  settingUpdateBodySchema,
  settingUpdateParamsSchema,
  settingsListQuerySchema,
} from "./settings.dto";

const c = createContractRouter("/settings", { tags: ["settings"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
  "/getAll",
  validate({ query: settingsListQuerySchema }),
  contract({
    operationId: "settings_list",
    summary: "List app settings",
    auth: { type: "frontend_bearer_http" },
    request: { query: settingsListQuerySchema },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr("{ settings: AppSettings[]; canEdit: boolean }", ["AppSettings"]),
      },
    ],
  }),
  settingsController.getAll
);

c.put(
  "/update/:settingId/:key",
  AccessControl.hasPermission(AppPermissions.SettingsEdit),
  validate({ params: settingUpdateParamsSchema, body: settingUpdateBodySchema, bodyContentType: "application/json" }),
  contract({
    operationId: "settings_update",
    summary: "Update one app setting",
    auth: { type: "frontend_permission_http", permission: AppPermissions.SettingsEdit },
    request: { params: settingUpdateParamsSchema, body: settingUpdateBodySchema, bodyContentType: "application/json" },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("AppSettings", ["AppSettings"]) }],
  }),
  settingsController.updateAppSetting
);

export default router;

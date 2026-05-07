import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { webhookController } from "./webhook.controller";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import { webhookIdParamSchema, webhookIdsParamSchema, webhooksListQuerySchema } from "./webhook.dto";

const c = createContractRouter("/webhooks", { tags: ["webhooks"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
  "/getAll",
  AccessControl.hasPermission(AppPermissions.WebhookView),
  validate({ query: webhooksListQuerySchema }),
  contract({
    operationId: "webhooks_list",
    summary: "List webhooks",
    auth: { type: "frontend_permission_http", permission: AppPermissions.WebhookView },
    request: { query: webhooksListQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("{ webhooks: Webhook[]; canDelete: boolean }", ["Webhook"]) }],
  }),
  webhookController.getWebhooks
);

c.delete(
  "/delete/:webhookId",
  AccessControl.hasPermission(AppPermissions.WebhookDelete),
  validate({ params: webhookIdParamSchema }),
  contract({
    operationId: "webhooks_delete",
    summary: "Delete one webhook",
    auth: { type: "frontend_permission_http", permission: AppPermissions.WebhookDelete },
    request: { params: webhookIdParamSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  webhookController.deleteWebhook
);

c.delete(
  "/delete/mass/:webhookIds",
  AccessControl.hasPermission(AppPermissions.WebhookDelete),
  validate({ params: webhookIdsParamSchema }),
  contract({
    operationId: "webhooks_delete_bulk",
    summary: "Delete multiple webhooks",
    auth: { type: "frontend_permission_http", permission: AppPermissions.WebhookDelete },
    request: { params: webhookIdsParamSchema },
    responses: [{ kind: "json", status: 200, data: require("zod").null() }],
  }),
  webhookController.deleteWebhooks
);

export default router;

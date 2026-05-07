import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { appInfoController } from "./app-info.controller";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRefExpr } from "@/api-contract/type-ref";
import { appInfoQuerySchema } from "./app-info.dto";
import { z } from "zod";

const c = createContractRouter("/app-info", { tags: ["app-info"] });
const router: Router = c.router;

// ── Public endpoints (no auth — needed by uptime monitors + discovery) ──

c.get(
  "/health",
  validate({}),
  contract({
    operationId: "app_info_health",
    summary: "Health check",
    responses: [{ kind: "json", status: 200, data: z.object({ status: z.string(), timestamp: z.string(), uptime: z.number() }) }],
  }),
  appInfoController.getHealth,
);

c.get(
  "/manifest",
  validate({}),
  contract({
    operationId: "app_info_manifest",
    summary: "AMP App Manifest",
    responses: [{ kind: "json", status: 200, data: z.any() }],
  }),
  appInfoController.getManifest,
);

// ── Authenticated endpoints ──

router.use(AccessControl.isAuthUser());

c.get(
  "/",
  validate({ query: appInfoQuerySchema }),
  contract({
    operationId: "app_info_get",
    summary: "Get app info for current user",
    auth: { type: "frontend_bearer_http" },
    request: { query: appInfoQuerySchema },
    responses: [
      {
        kind: "json",
        status: 200,
        data: typeRefExpr(
          "{ plannerUser: NodeTemplateUser; plannerUsers?: NodeTemplateUser[]; userRoles: Role[]; subscriptionLimits?: { planCode: 'base' | 'premium' | 'enterprise' | 'legacy'; sourceRoles: string[]; maxManagingCompanies: number | null; maxDocumentStorageGb: number | null }; subscriptionUsage?: { managingCompanies: { used: number; limit: number | null; remaining: number | null; canCreate: boolean }; documentStorage: { costPerGbEur: number; pricePerGbEur: number; usedBytes: number; usedGb: number; documentsCount: number; limitGb: number | null; remainingGb: number | null; canUpload: boolean; estimatedProviderCostEur: number; estimatedCustomerPriceEur: number; estimatedMarginEur: number; byManagingCompany: Array<{ managingCompanyId: number; companyName: string | null; documentsCount: number; usedBytes: number; usedGb: number; estimatedProviderCostEur: number; estimatedCustomerPriceEur: number; estimatedMarginEur: number }> } }; subscription?: { canCreateManagingCompany: boolean; canUploadDocuments: boolean; upgradeUrl: string | null } }",
          ["NodeTemplateUser", "Role"]
        ),
      },
    ],
  }),
  appInfoController.getAppInfo
);

c.get(
  "/ownPermissions",
  validate({ query: appInfoQuerySchema }),
  contract({
    operationId: "app_info_own_permissions_get",
    summary: "Get own permissions",
    auth: { type: "frontend_bearer_http" },
    request: { query: appInfoQuerySchema },
    responses: [{ kind: "json", status: 200, data: typeRefExpr("Permission[]", ["Permission"]) }],
  }),
  appInfoController.getOwnPermissions
);

export default router;

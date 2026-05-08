// Catalog-Routes — schema-driven FE Foundation.
//
// Ein Frontend-Picker für Severities, Status, Playbooks etc. braucht NICHT
// die Enum-Werte selbst zu kennen — er holt sich `/catalog/enums` und rendert.
// Backend-Add (z.B. neue Severity "blocker") → FE zeigt sie automatisch.

import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract } from "@/api-contract/contract.middleware";
import { catalogController } from "./catalog.controller";
import {
    catalogEnumsResponseSchema,
    catalogPlaybooksResponseSchema,
    catalogWorkersResponseSchema,
} from "./catalog.dto";

const c = createContractRouter("/catalog", { tags: ["secu-catalog"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/enums",
    contract({
        operationId: "secu_catalog_enums",
        summary: "All system enums (severity, status, kinds, scopes, ...) with display metadata for schema-driven UI",
        auth: { type: "frontend_bearer_http" },
        request: {},
        responses: [{ kind: "json", status: 200, data: catalogEnumsResponseSchema }],
    }),
    catalogController.listEnums.bind(catalogController),
);

c.get(
    "/playbooks",
    contract({
        operationId: "secu_catalog_playbooks",
        summary: "Registered playbooks with display metadata (label, category, danger, requiredScope)",
        auth: { type: "frontend_bearer_http" },
        request: {},
        responses: [{ kind: "json", status: 200, data: catalogPlaybooksResponseSchema }],
    }),
    catalogController.listPlaybooks.bind(catalogController),
);

c.get(
    "/workers",
    contract({
        operationId: "secu_catalog_workers",
        summary: "Registered workers with display metadata (jobKey, category, scope, target kinds)",
        auth: { type: "frontend_bearer_http" },
        request: {},
        responses: [{ kind: "json", status: 200, data: catalogWorkersResponseSchema }],
    }),
    catalogController.listWorkers.bind(catalogController),
);

export default router;

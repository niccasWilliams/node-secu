// Rule-Routes — Phase 2.5.
//
// Pfad-Layout:
//   GET    /rules            → Liste (filter: trigger, enabled, scope)
//   GET    /rules/:id        → Detail
//   POST   /rules            → Anlegen
//   PATCH  /rules/:id        → Update (enable/disable inkl.)
//   DELETE /rules/:id        → Löschen

import { Router } from "express";
import { z } from "zod";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { ruleController } from "./rule.controller";
import {
    ruleCreateBodySchema,
    ruleListQuerySchema,
    ruleParamSchema,
    ruleUpdateBodySchema,
} from "./rule.dto";

const c = createContractRouter("/rules", { tags: ["secu-rules"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/",
    validate({ query: ruleListQuerySchema }),
    contract({
        operationId: "secu_rule_list",
        summary: "List rules (filter by trigger, enabled, scope)",
        auth: { type: "frontend_bearer_http" },
        request: { query: ruleListQuerySchema },
        responses: [{ kind: "json", status: 200, data: z.any() }],
    }),
    ruleController.list.bind(ruleController),
);

c.get(
    "/:id",
    validate({ params: ruleParamSchema }),
    contract({
        operationId: "secu_rule_get",
        summary: "Get a single rule",
        auth: { type: "frontend_bearer_http" },
        request: { params: ruleParamSchema },
        responses: [
            { kind: "json", status: 200, data: z.any() },
            { kind: "json", status: 404, data: z.any() },
        ],
    }),
    ruleController.get.bind(ruleController),
);

c.post(
    "/",
    validate({ body: ruleCreateBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_rule_create",
        summary: "Create a declarative rule",
        auth: { type: "frontend_bearer_http" },
        request: { body: ruleCreateBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 201, data: z.any() }],
    }),
    ruleController.create.bind(ruleController),
);

c.patch(
    "/:id",
    validate({ params: ruleParamSchema, body: ruleUpdateBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_rule_update",
        summary: "Update a rule (incl. enable/disable — takes effect immediately)",
        auth: { type: "frontend_bearer_http" },
        request: { params: ruleParamSchema, body: ruleUpdateBodySchema, bodyContentType: "application/json" },
        responses: [
            { kind: "json", status: 200, data: z.any() },
            { kind: "json", status: 404, data: z.any() },
        ],
    }),
    ruleController.update.bind(ruleController),
);

c.delete(
    "/:id",
    validate({ params: ruleParamSchema }),
    contract({
        operationId: "secu_rule_delete",
        summary: "Delete a rule",
        auth: { type: "frontend_bearer_http" },
        request: { params: ruleParamSchema },
        responses: [
            { kind: "json", status: 200, data: z.any() },
            { kind: "json", status: 404, data: z.any() },
        ],
    }),
    ruleController.remove.bind(ruleController),
);

export default router;

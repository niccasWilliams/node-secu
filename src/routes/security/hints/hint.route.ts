// Hint-Routes — Sprint 1 (features.md §2.1).
//
// Pfad-Layout (Router sitzt auf "/", siehe individual-routes.ts):
//   GET    /engagements/:id/hints
//   POST   /engagements/:id/hints              (Bulk: { items: [{slot, value, ...}, ...] })
//   PATCH  /engagements/:id/hints/:hintId
//   DELETE /engagements/:id/hints/:hintId
//
// Hints leben nur im Engagement-Kontext — kein Top-Level /hints. PATCH/DELETE
// prüfen, dass `hintId` zum `engagementId` aus dem Pfad gehört (Cross-Engagement-Schutz).

import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { hintController } from "./hint.controller";
import {
    engagementHintByIdParamsSchema,
    engagementHintsParamsSchema,
    hintCreateBodySchema,
    hintListQuerySchema,
    hintPatchBodySchema,
} from "./hint.dto";
import {
    hintSchema,
    noDataSchema,
} from "../security-response.dto";

const c = createContractRouter("/", { tags: ["secu-hints"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/engagements/:id/hints",
    validate({ params: engagementHintsParamsSchema, query: hintListQuerySchema }),
    contract({
        operationId: "secu_engagement_hints_list",
        summary: "List operator hints attached to an engagement (filterbar nach status/slot, Sprint 2 Workflow-Lifecycle)",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementHintsParamsSchema, query: hintListQuerySchema },
        responses: [
            { kind: "json", status: 200, data: hintSchema.array() },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    hintController.list.bind(hintController),
);

c.post(
    "/engagements/:id/hints",
    validate({
        params: engagementHintsParamsSchema,
        body: hintCreateBodySchema,
        bodyContentType: "application/json",
    }),
    contract({
        operationId: "secu_engagement_hints_create",
        summary: "Create one or more operator hints for an engagement (bulk)",
        auth: { type: "frontend_bearer_http" },
        request: {
            params: engagementHintsParamsSchema,
            body: hintCreateBodySchema,
            bodyContentType: "application/json",
        },
        responses: [
            { kind: "json", status: 201, data: hintSchema.array() },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    hintController.create.bind(hintController),
);

c.patch(
    "/engagements/:id/hints/:hintId",
    validate({
        params: engagementHintByIdParamsSchema,
        body: hintPatchBodySchema,
        bodyContentType: "application/json",
    }),
    contract({
        operationId: "secu_engagement_hints_patch",
        summary: "Patch a single hint (value/source/notes)",
        auth: { type: "frontend_bearer_http" },
        request: {
            params: engagementHintByIdParamsSchema,
            body: hintPatchBodySchema,
            bodyContentType: "application/json",
        },
        responses: [
            { kind: "json", status: 200, data: hintSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    hintController.patch.bind(hintController),
);

c.delete(
    "/engagements/:id/hints/:hintId",
    validate({ params: engagementHintByIdParamsSchema }),
    contract({
        operationId: "secu_engagement_hints_delete",
        summary: "Delete a hint",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementHintByIdParamsSchema },
        responses: [
            { kind: "json", status: 204, data: noDataSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    hintController.remove.bind(hintController),
);

export default router;

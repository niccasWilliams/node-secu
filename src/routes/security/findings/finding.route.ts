// Finding-Routes — Command-Center surface.
//
// Findings are the primary output of scans. Engagement-scoped, filterable
// by severity/status/category/worker/entity, plus full Triage-Workflow
// (status + reason + note + resolution note) and Comment-Thread.

import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { findingController } from "./finding.controller";
import {
    findingByIdParamsSchema,
    findingCommentBodySchema,
    findingCommentByIdParamsSchema,
    findingListParamsSchema,
    findingListQuerySchema,
    findingPatchBodySchema,
} from "./finding.dto";
import {
    findingCommentSchema,
    findingCommentWithAuthorSchema,
    findingPatchResponseSchema,
    findingWithContextSchema,
    noDataSchema,
} from "../security-response.dto";

const c = createContractRouter("/", { tags: ["secu-findings"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/engagements/:id/findings",
    validate({ params: findingListParamsSchema, query: findingListQuerySchema }),
    contract({
        operationId: "secu_finding_list",
        summary: "List findings for an engagement (filterable + paginated; supports triage filter)",
        auth: { type: "frontend_bearer_http" },
        request: { params: findingListParamsSchema, query: findingListQuerySchema },
        responses: [
            { kind: "json", status: 200, data: findingWithContextSchema.array() },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    findingController.list.bind(findingController),
);

c.get(
    "/engagements/:id/findings/:findingId",
    validate({ params: findingByIdParamsSchema }),
    contract({
        operationId: "secu_finding_get",
        summary: "Get one finding with entity and worker context",
        auth: { type: "frontend_bearer_http" },
        request: { params: findingByIdParamsSchema },
        responses: [
            { kind: "json", status: 200, data: findingWithContextSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    findingController.get.bind(findingController),
);

c.patch(
    "/engagements/:id/findings/:findingId",
    validate({
        params: findingByIdParamsSchema,
        body: findingPatchBodySchema,
        bodyContentType: "application/json",
    }),
    contract({
        operationId: "secu_finding_patch",
        summary: "Update finding triage (status + optional reason/note/resolution-note)",
        auth: { type: "frontend_bearer_http" },
        request: {
            params: findingByIdParamsSchema,
            body: findingPatchBodySchema,
            bodyContentType: "application/json",
        },
        responses: [
            { kind: "json", status: 200, data: findingPatchResponseSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    findingController.patch.bind(findingController),
);

c.get(
    "/engagements/:id/findings/:findingId/comments",
    validate({ params: findingByIdParamsSchema }),
    contract({
        operationId: "secu_finding_comments_list",
        summary: "List operator comments on a finding (chronological)",
        auth: { type: "frontend_bearer_http" },
        request: { params: findingByIdParamsSchema },
        responses: [
            { kind: "json", status: 200, data: findingCommentWithAuthorSchema.array() },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    findingController.listComments.bind(findingController),
);

c.post(
    "/engagements/:id/findings/:findingId/comments",
    validate({
        params: findingByIdParamsSchema,
        body: findingCommentBodySchema,
        bodyContentType: "application/json",
    }),
    contract({
        operationId: "secu_finding_comment_create",
        summary: "Add an operator comment to a finding",
        auth: { type: "frontend_bearer_http" },
        request: {
            params: findingByIdParamsSchema,
            body: findingCommentBodySchema,
            bodyContentType: "application/json",
        },
        responses: [
            { kind: "json", status: 201, data: findingCommentSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    findingController.createComment.bind(findingController),
);

c.delete(
    "/engagements/:id/findings/:findingId/comments/:commentId",
    validate({ params: findingCommentByIdParamsSchema }),
    contract({
        operationId: "secu_finding_comment_delete",
        summary: "Delete a comment on a finding",
        auth: { type: "frontend_bearer_http" },
        request: { params: findingCommentByIdParamsSchema },
        responses: [
            { kind: "json", status: 204, data: noDataSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    findingController.deleteComment.bind(findingController),
);

export default router;

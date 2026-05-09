import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { engagementController } from "./engagement.controller";
import {
    engagementCreateBodySchema,
    engagementAuthorizationParamsSchema,
    engagementEntityLinkBodySchema,
    engagementEntityListQuerySchema,
    engagementEntityParamsSchema,
    engagementListQuerySchema,
    engagementNoteBodySchema,
    engagementParamsSchema,
    engagementUpdateBodySchema,
    grantAuthBodySchema,
    osintEmailEntityBodySchema,
} from "./engagement.dto";
import {
    engagementCreateResponseSchema,
    engagementEntityLinkResponseSchema,
    engagementGraphSchema,
    engagementSchema,
    engagementListItemSchema,
    engagementWithGraphSchema,
    engagementEntityListItemSchema,
    grantAuthorizationResponseSchema,
    authorizationWithEntitySchema,
    revokeAuthorizationResponseSchema,
    idSchema,
    noDataSchema,
    osintEmailLinkResponseSchema,
    signalChainLogSchema,
} from "../security-response.dto";

const c = createContractRouter("/engagements", { tags: ["secu-engagements"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.post(
    "/",
    validate({ body: engagementCreateBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_engagement_create",
        summary: "Create engagement (optional convenience: include primaryDomain to bootstrap entity + auth)",
        auth: { type: "frontend_bearer_http" },
        request: { body: engagementCreateBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 201, data: engagementCreateResponseSchema }],
    }),
    engagementController.create.bind(engagementController),
);

c.get(
    "/",
    validate({ query: engagementListQuerySchema }),
    contract({
        operationId: "secu_engagement_list",
        summary: "List engagements (mit findingsBySeverity, primaryDomain, owner-Bundle)",
        auth: { type: "frontend_bearer_http" },
        request: { query: engagementListQuerySchema },
        responses: [{ kind: "json", status: 200, data: engagementListItemSchema.array() }],
    }),
    engagementController.list.bind(engagementController),
);

c.get(
    "/:id",
    validate({ params: engagementParamsSchema }),
    contract({
        operationId: "secu_engagement_get",
        summary: "Get engagement (with embedded graph snapshot + counts)",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema },
        responses: [{ kind: "json", status: 200, data: engagementWithGraphSchema }, { kind: "json", status: 404, data: noDataSchema }],
    }),
    engagementController.getById.bind(engagementController),
);

c.patch(
    "/:id",
    validate({ params: engagementParamsSchema, body: engagementUpdateBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_engagement_update",
        summary: "Update engagement",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema, body: engagementUpdateBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 200, data: engagementSchema }, { kind: "json", status: 404, data: noDataSchema }],
    }),
    engagementController.update.bind(engagementController),
);

c.delete(
    "/:id",
    validate({ params: engagementParamsSchema }),
    contract({
        operationId: "secu_engagement_archive",
        summary: "Archive engagement (soft delete)",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema },
        responses: [{ kind: "json", status: 200, data: engagementSchema }, { kind: "json", status: 404, data: noDataSchema }],
    }),
    engagementController.archive.bind(engagementController),
);

c.get(
    "/:id/graph",
    validate({ params: engagementParamsSchema }),
    contract({
        operationId: "secu_engagement_graph",
        summary: "Cytoscape-compatible graph snapshot for an engagement",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema },
        responses: [{ kind: "json", status: 200, data: engagementGraphSchema }],
    }),
    engagementController.getGraph.bind(engagementController),
);

c.get(
    "/:id/entities",
    validate({ params: engagementParamsSchema, query: engagementEntityListQuerySchema }),
    contract({
        operationId: "secu_engagement_entities_list",
        summary: "List entities linked to an engagement",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema, query: engagementEntityListQuerySchema },
        responses: [{ kind: "json", status: 200, data: engagementEntityListItemSchema.array() }],
    }),
    engagementController.listEntities.bind(engagementController),
);

c.post(
    "/:id/entities",
    validate({ params: engagementParamsSchema, body: engagementEntityLinkBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_engagement_entity_link",
        summary: "Link an entity to an engagement (or upsert+link in one call)",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema, body: engagementEntityLinkBodySchema, bodyContentType: "application/json" },
        responses: [
            { kind: "json", status: 200, data: engagementEntityLinkResponseSchema },
            { kind: "json", status: 201, data: engagementEntityLinkResponseSchema },
        ],
    }),
    engagementController.linkEntity.bind(engagementController),
);

c.delete(
    "/:id/entities/:entityId",
    validate({ params: engagementEntityParamsSchema }),
    contract({
        operationId: "secu_engagement_entity_unlink",
        summary: "Unlink an entity from an engagement",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementEntityParamsSchema },
        responses: [{ kind: "json", status: 204, data: noDataSchema }],
    }),
    engagementController.unlinkEntity.bind(engagementController),
);

c.post(
    "/:id/notes",
    validate({ params: engagementParamsSchema, body: engagementNoteBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_engagement_note_create",
        summary: "Add a note (artifact kind=note) to an engagement",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema, body: engagementNoteBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 201, data: idSchema }],
    }),
    engagementController.addNote.bind(engagementController),
);

c.post(
    "/:id/authorizations",
    validate({ params: engagementParamsSchema, body: grantAuthBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_engagement_auth_grant",
        summary: "Grant an authorization to an entity (also links the entity to the engagement)",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema, body: grantAuthBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 201, data: grantAuthorizationResponseSchema }],
    }),
    engagementController.grantAuthorization.bind(engagementController),
);

c.get(
    "/:id/authorizations",
    validate({ params: engagementParamsSchema }),
    contract({
        operationId: "secu_engagement_auth_list",
        summary: "List entity authorizations for an engagement with effective scan decisions",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema },
        responses: [
            { kind: "json", status: 200, data: authorizationWithEntitySchema.array() },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    engagementController.listAuthorizations.bind(engagementController),
);

c.delete(
    "/:id/authorizations/:authorizationId",
    validate({ params: engagementAuthorizationParamsSchema }),
    contract({
        operationId: "secu_engagement_auth_revoke",
        summary: "Revoke an authorization in an engagement",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementAuthorizationParamsSchema },
        responses: [
            { kind: "json", status: 200, data: revokeAuthorizationResponseSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    engagementController.revokeAuthorization.bind(engagementController),
);

// Phase 2.7 — OSINT Email-Entity Convenience-Endpoint.
c.post(
    "/:id/entities/email",
    validate({ params: engagementParamsSchema, body: osintEmailEntityBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_engagement_osint_email_link",
        summary: "Phase 2.7 — Lege email_address-Entity an, verlinke zur Person, Auto-Chain greift",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema, body: osintEmailEntityBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 201, data: osintEmailLinkResponseSchema }],
    }),
    engagementController.linkOsintEmailEntity.bind(engagementController),
);

// Phase 2.7 — Signal-Chain-Log-Liste pro Engagement.
c.get(
    "/:id/signal-chains",
    validate({ params: engagementParamsSchema }),
    contract({
        operationId: "secu_engagement_signal_chains_list",
        summary: "Phase 2.7 — Listet OSINT-Signal-Chain-Logs (manuelle person_full-Trigger + Auto-Chains)",
        auth: { type: "frontend_bearer_http" },
        request: { params: engagementParamsSchema },
        responses: [{ kind: "json", status: 200, data: signalChainLogSchema.array() }],
    }),
    engagementController.listSignalChains.bind(engagementController),
);

export default router;

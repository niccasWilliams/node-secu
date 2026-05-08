import { Router } from "express";
import { z } from "zod";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { engagementController } from "./engagement.controller";
import {
    engagementCreateBodySchema,
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
        responses: [{ kind: "json", status: 201, data: z.any() }],
    }),
    engagementController.create.bind(engagementController),
);

c.get(
    "/",
    validate({ query: engagementListQuerySchema }),
    contract({
        operationId: "secu_engagement_list",
        summary: "List engagements",
        auth: { type: "frontend_bearer_http" },
        request: { query: engagementListQuerySchema },
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }, { kind: "json", status: 404, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }, { kind: "json", status: 404, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }, { kind: "json", status: 404, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
            { kind: "json", status: 200, data: z.any() },
            { kind: "json", status: 201, data: z.any() },
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
        responses: [{ kind: "json", status: 204, data: z.any() }],
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
        responses: [{ kind: "json", status: 201, data: z.any() }],
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
        responses: [{ kind: "json", status: 201, data: z.any() }],
    }),
    engagementController.grantAuthorization.bind(engagementController),
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
        responses: [{ kind: "json", status: 201, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }],
    }),
    engagementController.listSignalChains.bind(engagementController),
);

export default router;

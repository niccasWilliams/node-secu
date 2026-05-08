import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { entityController } from "./entity.controller";
import {
    entityCreateBodySchema,
    entityEnrichFullBodySchema,
    entityListQuerySchema,
    entityParamsSchema,
    entityPatchBodySchema,
    entityRelationshipBodySchema,
    entityTagBodySchema,
} from "./entity.dto";
import {
    entityDetailSchema,
    entityRelationshipSchema,
    entityRelationshipWithEntitiesSchema,
    entitySchema,
    entitySearchItemSchema,
    enrichFullResponseSchema,
    noDataSchema,
    tagResponseSchema,
} from "../security-response.dto";

const c = createContractRouter("/entities", { tags: ["secu-entities"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.post(
    "/",
    validate({ body: entityCreateBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_entity_upsert",
        summary: "Create or upsert a global entity (deduplicated via canonical_key)",
        auth: { type: "frontend_bearer_http" },
        request: { body: entityCreateBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 200, data: entitySchema }],
    }),
    entityController.upsert.bind(entityController),
);

c.get(
    "/",
    validate({ query: entityListQuerySchema }),
    contract({
        operationId: "secu_entity_search",
        summary: "Search global entities (kind + free text)",
        auth: { type: "frontend_bearer_http" },
        request: { query: entityListQuerySchema },
        responses: [{ kind: "json", status: 200, data: entitySearchItemSchema.array() }],
    }),
    entityController.list.bind(entityController),
);

c.get(
    "/:id",
    validate({ params: entityParamsSchema }),
    contract({
        operationId: "secu_entity_get",
        summary: "Get entity detail (incl. tags, engagements, relationship-count)",
        auth: { type: "frontend_bearer_http" },
        request: { params: entityParamsSchema },
        responses: [{ kind: "json", status: 200, data: entityDetailSchema }, { kind: "json", status: 404, data: noDataSchema }],
    }),
    entityController.getDetail.bind(entityController),
);

c.get(
    "/:id/relationships",
    validate({ params: entityParamsSchema }),
    contract({
        operationId: "secu_entity_relationships_list",
        summary: "List relationships incident to an entity",
        auth: { type: "frontend_bearer_http" },
        request: { params: entityParamsSchema },
        responses: [{ kind: "json", status: 200, data: entityRelationshipWithEntitiesSchema.array() }],
    }),
    entityController.listRelationships.bind(entityController),
);

c.post(
    "/:id/relationships",
    validate({ params: entityParamsSchema, body: entityRelationshipBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_entity_relationship_upsert",
        summary: "Upsert a relationship from this entity to another",
        auth: { type: "frontend_bearer_http" },
        request: { params: entityParamsSchema, body: entityRelationshipBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 201, data: entityRelationshipSchema }],
    }),
    entityController.createRelationship.bind(entityController),
);

c.post(
    "/:id/tags",
    validate({ params: entityParamsSchema, body: entityTagBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_entity_tag_add",
        summary: "Add a tag to an entity (idempotent)",
        auth: { type: "frontend_bearer_http" },
        request: { params: entityParamsSchema, body: entityTagBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 201, data: tagResponseSchema }],
    }),
    entityController.addTag.bind(entityController),
);

c.patch(
    "/:id",
    validate({ params: entityParamsSchema, body: entityPatchBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_entity_patch",
        summary: "Operator-edit an entity: merge data, optional displayName-update",
        auth: { type: "frontend_bearer_http" },
        request: { params: entityParamsSchema, body: entityPatchBodySchema, bodyContentType: "application/json" },
        responses: [
            { kind: "json", status: 200, data: entitySchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    entityController.patch.bind(entityController),
);

// Phase 2.7 — manueller OSINT-Full-Enrichment-Trigger.
c.post(
    "/:id/enrich/full",
    validate({ params: entityParamsSchema, body: entityEnrichFullBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "secu_entity_enrich_full",
        summary: "Phase 2.7 — Trigger osint_person_full: load linked identities, run their playbooks, persist signal_chain_log",
        auth: { type: "frontend_bearer_http" },
        request: { params: entityParamsSchema, body: entityEnrichFullBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 202, data: enrichFullResponseSchema }],
    }),
    entityController.enrichFull.bind(entityController),
);

export default router;

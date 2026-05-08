import { Router } from "express";
import { z } from "zod";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { entityController } from "./entity.controller";
import {
    entityCreateBodySchema,
    entityListQuerySchema,
    entityParamsSchema,
    entityRelationshipBodySchema,
    entityTagBodySchema,
} from "./entity.dto";

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
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }, { kind: "json", status: 404, data: z.any() }],
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
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
        responses: [{ kind: "json", status: 201, data: z.any() }],
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
        responses: [{ kind: "json", status: 201, data: z.any() }],
    }),
    entityController.addTag.bind(entityController),
);

export default router;

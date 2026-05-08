// Intelligence-Routes — globale, engagement-übergreifende Sicht für die
// Kommandozentrale. Liefert Neighborhood-Slices (Lazy-Mindmap-Loading) und
// cross-engagement Tech-/Identity-Verbindungen.

import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { intelligenceController } from "./intelligence.controller";
import {
    crossEngagementHitsQuerySchema,
    crossEngagementHitsResponseSchema,
    neighborhoodParamsSchema,
    neighborhoodQuerySchema,
    neighborhoodResponseSchema,
    techGraphQuerySchema,
    techGraphResponseSchema,
    techUsagesParamsSchema,
    techUsagesQuerySchema,
    techUsagesResponseSchema,
} from "./intelligence.dto";
import { noDataSchema } from "../security-response.dto";

const c = createContractRouter("/intelligence", { tags: ["secu-intelligence"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/cross-engagement-hits",
    validate({ query: crossEngagementHitsQuerySchema }),
    contract({
        operationId: "secu_intel_cross_engagement_hits",
        summary: "Entities, die in 2+ aktiven Engagements vorkommen (Identity-Pivots)",
        auth: { type: "frontend_bearer_http" },
        request: { query: crossEngagementHitsQuerySchema },
        responses: [{ kind: "json", status: 200, data: crossEngagementHitsResponseSchema }],
    }),
    intelligenceController.crossEngagementHits.bind(intelligenceController),
);

c.get(
    "/tech-graph",
    validate({ query: techGraphQuerySchema }),
    contract({
        operationId: "secu_intel_tech_graph",
        summary: "Aggregierter Tech-Graph: welche Tech-Stacks tauchen über mehrere Engagements auf?",
        auth: { type: "frontend_bearer_http" },
        request: { query: techGraphQuerySchema },
        responses: [{ kind: "json", status: 200, data: techGraphResponseSchema }],
    }),
    intelligenceController.techGraph.bind(intelligenceController),
);

c.get(
    "/tech/:techName/usages",
    validate({ params: techUsagesParamsSchema, query: techUsagesQuerySchema }),
    contract({
        operationId: "secu_intel_tech_usages",
        summary: "Wo (Entities + Engagements) wird ein konkreter Tech-Fingerprint gefunden?",
        auth: { type: "frontend_bearer_http" },
        request: { params: techUsagesParamsSchema, query: techUsagesQuerySchema },
        responses: [{ kind: "json", status: 200, data: techUsagesResponseSchema }],
    }),
    intelligenceController.techUsages.bind(intelligenceController),
);

c.get(
    "/entities/:id/neighborhood",
    validate({ params: neighborhoodParamsSchema, query: neighborhoodQuerySchema }),
    contract({
        operationId: "secu_intel_entity_neighborhood",
        summary: "k-Hop-Neighborhood einer Entity über alle Engagements (Lazy-Mindmap-Loading)",
        auth: { type: "frontend_bearer_http" },
        request: { params: neighborhoodParamsSchema, query: neighborhoodQuerySchema },
        responses: [
            { kind: "json", status: 200, data: neighborhoodResponseSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    intelligenceController.neighborhood.bind(intelligenceController),
);

export default router;

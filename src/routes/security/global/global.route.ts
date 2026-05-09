// Globale, engagement-übergreifende Routen für das Operator-FE Intelligence-Dashboard.
//
//   GET /graph/aggregate   — Cross-Engagement-Aggregat-Graph mit Dedup
//   GET /activity          — Cross-Engagement Activity-Feed (worker_runs / findings / chains)
//   GET /findings          — Globale Findings-Inbox + Aggregations
//   GET /workers/runs      — Globale Worker-Run-History + running/pending Counter
//
// Permission-Layer: AccessControl.isAuthUser(). node-secu ist Solo-Operator-Tool;
// FE darf alle nicht-archivierten Engagements lesen. Falls später Multi-Tenant-
// Owner-Filter nötig wird, hier zentral nachziehen.

import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { globalController } from "./global.controller";
import {
    activityQuerySchema,
    aggregateGraphQuerySchema,
    findingsGlobalQuerySchema,
    workerRunsGlobalQuerySchema,
} from "./global.dto";
import {
    activityFeedResponseSchema,
    aggregateGraphSchema,
    findingsGlobalResponseSchema,
    workerRunsGlobalResponseSchema,
} from "../security-response.dto";

const c = createContractRouter("/", { tags: ["secu-global"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/graph/aggregate",
    validate({ query: aggregateGraphQuerySchema }),
    contract({
        operationId: "secu_graph_aggregate",
        summary: "Cross-Engagement-Aggregat-Graph (canonicalKey-Dedup, Severity-Heatmap, 2000-Node-Cap)",
        auth: { type: "frontend_bearer_http" },
        request: { query: aggregateGraphQuerySchema },
        responses: [{ kind: "json", status: 200, data: aggregateGraphSchema }],
    }),
    globalController.aggregateGraph.bind(globalController),
);

c.get(
    "/activity",
    validate({ query: activityQuerySchema }),
    contract({
        operationId: "secu_activity_feed",
        summary: "Cross-Engagement Activity-Feed (worker_runs / findings / signal_chains / playbook_runs / status)",
        auth: { type: "frontend_bearer_http" },
        request: { query: activityQuerySchema },
        responses: [{ kind: "json", status: 200, data: activityFeedResponseSchema }],
    }),
    globalController.activity.bind(globalController),
);

c.get(
    "/findings",
    validate({ query: findingsGlobalQuerySchema }),
    contract({
        operationId: "secu_findings_global",
        summary: "Globale Findings-Inbox über alle Engagements (mit aggregations bySeverity/byStatus/byCategory)",
        auth: { type: "frontend_bearer_http" },
        request: { query: findingsGlobalQuerySchema },
        responses: [{ kind: "json", status: 200, data: findingsGlobalResponseSchema }],
    }),
    globalController.findings.bind(globalController),
);

c.get(
    "/workers/runs",
    validate({ query: workerRunsGlobalQuerySchema }),
    contract({
        operationId: "secu_worker_runs_global",
        summary: "Globale Worker-Run-History inkl. running/pending Counter für Live-Status",
        auth: { type: "frontend_bearer_http" },
        request: { query: workerRunsGlobalQuerySchema },
        responses: [{ kind: "json", status: 200, data: workerRunsGlobalResponseSchema }],
    }),
    globalController.workerRuns.bind(globalController),
);

export default router;

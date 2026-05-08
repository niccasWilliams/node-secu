// Worker-Routes — Phase 4.5 Trust-Layer.
//
// Pfad-Layout:
//   GET    /workers                                       → Registry-Liste
//   POST   /engagements/:id/workers/:workerKey/run        → Ad-hoc-Run starten
//   GET    /engagements/:id/workers/runs                  → Alle worker-runs des Engagements
//   GET    /engagements/:id/workers/runs/:runId           → Einzelner worker-run

import { Router } from "express";
import { z } from "zod";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { workerController } from "./worker.controller";
import {
    workerListQuerySchema,
    workerRunGetParamSchema,
    workerRunListParamSchema,
    workerRunListQuerySchema,
    workerRunStartBodySchema,
    workerRunStartParamSchema,
} from "./worker.dto";

const c = createContractRouter("/", { tags: ["secu-workers"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/workers",
    validate({ query: workerListQuerySchema }),
    contract({
        operationId: "secu_worker_registry_list",
        summary: "List all registered workers (registry view) — optionally filtered by scope/targetKind",
        auth: { type: "frontend_bearer_http" },
        request: { query: workerListQuerySchema },
        responses: [{ kind: "json", status: 200, data: z.any() }],
    }),
    workerController.listRegistry.bind(workerController),
);

c.post(
    "/engagements/:id/workers/:workerKey/run",
    validate({
        params: workerRunStartParamSchema,
        body: workerRunStartBodySchema,
        bodyContentType: "application/json",
    }),
    contract({
        operationId: "secu_worker_run_start",
        summary:
            "Trigger a single worker against one entity (ad-hoc; no playbook). " +
            "Synchronously executes and returns the persisted worker_run summary.",
        auth: { type: "frontend_bearer_http" },
        request: {
            params: workerRunStartParamSchema,
            body: workerRunStartBodySchema,
            bodyContentType: "application/json",
        },
        responses: [
            { kind: "json", status: 200, data: z.any() },
            { kind: "json", status: 400, data: z.any() },
            { kind: "json", status: 404, data: z.any() },
        ],
    }),
    workerController.startRun.bind(workerController),
);

c.get(
    "/engagements/:id/workers/runs",
    validate({ params: workerRunListParamSchema, query: workerRunListQuerySchema }),
    contract({
        operationId: "secu_worker_run_list",
        summary: "List worker runs for an engagement (filterable by workerKey/status/entityId)",
        auth: { type: "frontend_bearer_http" },
        request: { params: workerRunListParamSchema, query: workerRunListQuerySchema },
        responses: [{ kind: "json", status: 200, data: z.any() }],
    }),
    workerController.listRuns.bind(workerController),
);

c.get(
    "/engagements/:id/workers/runs/:runId",
    validate({ params: workerRunGetParamSchema }),
    contract({
        operationId: "secu_worker_run_get",
        summary: "Get a single worker run incl. exit_code, findings, error",
        auth: { type: "frontend_bearer_http" },
        request: { params: workerRunGetParamSchema },
        responses: [
            { kind: "json", status: 200, data: z.any() },
            { kind: "json", status: 404, data: z.any() },
        ],
    }),
    workerController.getRun.bind(workerController),
);

export default router;

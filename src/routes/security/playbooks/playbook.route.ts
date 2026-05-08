// Playbook-Routes — Phase 2.
//
// Pfad-Layout:
//   GET    /playbooks                                  → Registry-Liste
//   POST   /engagements/:id/playbooks/:playbookKey     → Run starten (202)
//   GET    /engagements/:id/playbooks/runs             → alle Runs des Engagements
//   GET    /engagements/:id/playbooks/runs/:runId      → Status eines Runs
//
// Der Router sitzt auf "/" (siehe individual-routes.ts), damit beide Pfad-Familien
// (`/playbooks`, `/engagements/.../playbooks`) hier liegen und nicht über zwei
// Router verteilt werden.

import { Router } from "express";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { playbookController } from "./playbook.controller";
import {
    playbookKeyParamSchema,
    playbookRunGetParamSchema,
    playbookRunListParamSchema,
    playbookRunListQuerySchema,
    playbookStartBodySchema,
} from "./playbook.dto";
import {
    noDataSchema,
    playbookBlockedResponseSchema,
    playbookRegistryItemSchema,
    playbookRunLeanStatusSchema,
    playbookRunSchema,
    playbookRunStatusReportSchema,
    playbookStartResponseSchema,
} from "../security-response.dto";

const c = createContractRouter("/", { tags: ["secu-playbooks"] });
const router: Router = c.router;

router.use(AccessControl.isAuthUser());

c.get(
    "/playbooks",
    contract({
        operationId: "secu_playbook_registry_list",
        summary: "List all registered playbooks (registry view)",
        auth: { type: "frontend_bearer_http" },
        request: {},
        responses: [{ kind: "json", status: 200, data: playbookRegistryItemSchema.array() }],
    }),
    playbookController.listRegistry.bind(playbookController),
);

c.post(
    "/engagements/:id/playbooks/:playbookKey",
    validate({
        params: playbookKeyParamSchema,
        body: playbookStartBodySchema,
        bodyContentType: "application/json",
    }),
    contract({
        operationId: "secu_playbook_run_start",
        summary: "Start a playbook run for an engagement (background-executed; returns 202 immediately)",
        auth: { type: "frontend_bearer_http" },
        request: {
            params: playbookKeyParamSchema,
            body: playbookStartBodySchema,
            bodyContentType: "application/json",
        },
        responses: [
            { kind: "json", status: 202, data: playbookStartResponseSchema },
            { kind: "json", status: 400, data: noDataSchema },
            { kind: "json", status: 404, data: noDataSchema },
            { kind: "json", status: 429, data: playbookBlockedResponseSchema },
        ],
    }),
    playbookController.start.bind(playbookController),
);

c.get(
    "/engagements/:id/playbooks/runs",
    validate({ params: playbookRunListParamSchema, query: playbookRunListQuerySchema }),
    contract({
        operationId: "secu_playbook_run_list",
        summary: "List playbook runs for an engagement (paginated, filterable by status/playbookKey)",
        auth: { type: "frontend_bearer_http" },
        request: { params: playbookRunListParamSchema, query: playbookRunListQuerySchema },
        responses: [{ kind: "json", status: 200, data: playbookRunSchema.array() }],
    }),
    playbookController.listRuns.bind(playbookController),
);

c.get(
    "/engagements/:id/playbooks/runs/:runId",
    validate({ params: playbookRunGetParamSchema }),
    contract({
        operationId: "secu_playbook_run_get",
        summary: "Get a single playbook run incl. step summary + worker_runs",
        auth: { type: "frontend_bearer_http" },
        request: { params: playbookRunGetParamSchema },
        responses: [
            { kind: "json", status: 200, data: playbookRunStatusReportSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    playbookController.getRun.bind(playbookController),
);

c.get(
    "/engagements/:id/playbooks/runs/:runId/status",
    validate({ params: playbookRunGetParamSchema }),
    contract({
        operationId: "secu_playbook_run_status",
        summary: "Lean playbook run status for polling; sends ETag and supports If-None-Match",
        auth: { type: "frontend_bearer_http" },
        request: { params: playbookRunGetParamSchema },
        responses: [
            { kind: "json", status: 200, data: playbookRunLeanStatusSchema },
            { kind: "json", status: 404, data: noDataSchema },
        ],
    }),
    playbookController.getRunLeanStatus.bind(playbookController),
);

c.get(
    "/engagements/:id/playbooks/runs/:runId/events",
    validate({ params: playbookRunGetParamSchema }),
    contract({
        operationId: "secu_playbook_run_events",
        summary: "Server-Sent Events stream for playbook run status changes",
        auth: { type: "frontend_bearer_http" },
        request: { params: playbookRunGetParamSchema },
        responses: [{ kind: "binary", status: 200, contentType: "text/event-stream" }],
    }),
    playbookController.streamRunEvents.bind(playbookController),
);

export default router;

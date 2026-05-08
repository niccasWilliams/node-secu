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
import { z } from "zod";
import { AccessControl } from "@/routes/middleware";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { playbookController } from "./playbook.controller";
import {
    playbookKeyParamSchema,
    playbookRunGetParamSchema,
    playbookRunListParamSchema,
    playbookStartBodySchema,
} from "./playbook.dto";

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
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
            { kind: "json", status: 202, data: z.any() },
            { kind: "json", status: 400, data: z.any() },
            { kind: "json", status: 404, data: z.any() },
        ],
    }),
    playbookController.start.bind(playbookController),
);

c.get(
    "/engagements/:id/playbooks/runs",
    validate({ params: playbookRunListParamSchema }),
    contract({
        operationId: "secu_playbook_run_list",
        summary: "List playbook runs for an engagement",
        auth: { type: "frontend_bearer_http" },
        request: { params: playbookRunListParamSchema },
        responses: [{ kind: "json", status: 200, data: z.any() }],
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
            { kind: "json", status: 200, data: z.any() },
            { kind: "json", status: 404, data: z.any() },
        ],
    }),
    playbookController.getRun.bind(playbookController),
);

export default router;

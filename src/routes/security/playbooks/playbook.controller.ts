import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { playbookRunner, PlaybookRunnerError } from "@/lib/security/playbooks/playbook-runner";
import { listPlaybooks, getPlaybook } from "@/lib/security/playbooks/playbook-registry";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { getUserIdFromRequest } from "@/util/utils";
import type { PlaybookStartBody } from "./playbook.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class PlaybookController {
    /** Liste aller registrierten Playbooks (für Frontend-Discovery). */
    async listRegistry(_req: Request, res: Response) {
        try {
            const items = listPlaybooks().map((p) => ({
                key: p.key,
                label: p.label,
                description: p.description,
                acceptsRootEntityKinds: p.acceptsRootEntityKinds,
                maxRequiredScope: p.maxRequiredScope,
                steps: p.steps.map((s) => ({
                    key: s.key,
                    label: s.label,
                    workerKey: s.workerKey,
                    dependsOn: s.dependsOn ?? [],
                    hasCondition: !!s.when,
                })),
            }));
            return responseHandler(res, 200, undefined, items);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** POST /engagements/:id/playbooks/:playbookKey — Run starten. */
    async start(req: Request, res: Response) {
        try {
            const { id, playbookKey } = v<{ id: number; playbookKey: string }>(req, "params");
            const body = v<PlaybookStartBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const playbook = getPlaybook(playbookKey);
            if (!playbook) return responseHandler(res, 404, `Playbook not found: ${playbookKey}`);

            const out = await playbookRunner.startRun({
                engagementId: id,
                playbookKey,
                rootEntityId: body.rootEntityId,
                triggeredByUserId: userId,
                triggeredBy: body.triggeredBy ?? "manual",
                params: body.params,
            });
            // Sprint 1.3 — Hop-Budget-Block ist aktuell nur für Auto-Chains
            // relevant (parentRunId nötig). Manuelle HTTP-Aufrufe bekommen ihn
            // nicht — der explizite Type-Guard hier ist defensive Vorkehrung
            // (falls späterer Caller doch parentRunId mitgibt).
            if ("blocked" in out) {
                return responseHandler(res, 429, `playbook_blocked:${out.reason}`, out);
            }
            return responseHandler(res, 202, undefined, out);
        } catch (e: any) {
            if (e instanceof PlaybookRunnerError) {
                // Failure aus Validierung — 400; sonstige als 500.
                const transient = ["engagement_not_found", "engagement_archived", "root_entity_not_found", "root_entity_not_linked_to_engagement"];
                const status = transient.includes(e.message) || e.message.startsWith("root_entity_kind_unsupported") || e.message.startsWith("unknown_playbook")
                    ? 400 : 500;
                const userId = (await getUserIdFromRequest(req)) ?? null;
                void auditLogService.log({
                    action: "playbook_run.start_failed",
                    actorUserId: userId,
                    payload: { reason: e.message },
                    success: false,
                    errorMessage: e.message,
                });
                return responseHandler(res, status, e.message);
            }
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /engagements/:id/playbooks/runs */
    async listRuns(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const runs = await playbookRunner.listRunsForEngagement(id);
            return responseHandler(res, 200, undefined, runs);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /engagements/:id/playbooks/runs/:runId */
    async getRun(req: Request, res: Response) {
        try {
            const { runId } = v<{ id: number; runId: number }>(req, "params");
            const out = await playbookRunner.getRunStatus(runId);
            if (!out) return responseHandler(res, 404, "Run not found");
            return responseHandler(res, 200, undefined, out);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const playbookController = new PlaybookController();

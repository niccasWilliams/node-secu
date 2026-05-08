import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { playbookRunner, PlaybookRunnerError } from "@/lib/security/playbooks/playbook-runner";
import { listPlaybooks, getPlaybook } from "@/lib/security/playbooks/playbook-registry";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { getUserIdFromRequest } from "@/util/utils";
import type { PlaybookStartBody, PlaybookRunListQuery } from "./playbook.dto";
import { normalizePagination } from "@/api-contract/pagination.dto";

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
            const q = v<PlaybookRunListQuery>(req, "query");
            const p = normalizePagination(q, { defaultSort: "createdAt", defaultOrder: "desc", defaultLimit: 50 });
            const runs = await playbookRunner.listRunsForEngagement(id, {
                limit: p.limit,
                offset: p.offset,
                sortBy: p.sortBy as any,
                order: p.order,
                status: q.status,
                playbookKey: q.playbookKey,
            });
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

    /** GET /engagements/:id/playbooks/runs/:runId/status — lean polling target with ETag. */
    async getRunLeanStatus(req: Request, res: Response) {
        try {
            const { id, runId } = v<{ id: number; runId: number }>(req, "params");
            const out = await playbookRunner.getRunLeanStatus(runId);
            if (!out || out.engagementId !== id) return responseHandler(res, 404, "Run not found");

            res.setHeader("ETag", out.etag);
            res.setHeader("Cache-Control", "private, no-cache");
            if (req.headers["if-none-match"] === out.etag) {
                return res.status(304).end();
            }
            return responseHandler(res, 200, undefined, out);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /engagements/:id/playbooks/runs/:runId/events — SSE for long-running scans. */
    async streamRunEvents(req: Request, res: Response) {
        const { id, runId } = v<{ id: number; runId: number }>(req, "params");

        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        });

        let lastEtag: string | null = null;
        let closed = false;
        let timer: NodeJS.Timeout | null = null;
        const writeStatus = async () => {
            if (closed) return;
            try {
                const out = await playbookRunner.getRunLeanStatus(runId);
                if (!out || out.engagementId !== id) {
                    res.write(`event: error\ndata: ${JSON.stringify({ message: "Run not found" })}\n\n`);
                    closed = true;
                    res.end();
                    return;
                }
                if (out.etag !== lastEtag) {
                    lastEtag = out.etag;
                    res.write(`event: status\ndata: ${JSON.stringify(out)}\n\n`);
                } else {
                    res.write(": heartbeat\n\n");
                }
                if (["completed", "failed", "cancelled"].includes(out.status)) {
                    closed = true;
                    res.end();
                }
            } catch (e: any) {
                res.write(`event: error\ndata: ${JSON.stringify({ message: e?.message ?? "Internal Server Error" })}\n\n`);
                closed = true;
                res.end();
            }
        };

        req.on("close", () => {
            closed = true;
            if (timer) clearInterval(timer);
        });

        await writeStatus();
        if (closed) return;
        timer = setInterval(writeStatus, 2_000);
    }
}

export const playbookController = new PlaybookController();

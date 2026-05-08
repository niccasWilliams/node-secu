// Worker-Controller — Phase 4.5 Trust-Layer.
//
// Erlaubt zwei Dinge, die der Playbook-Path nicht abdeckt:
//   1) Registry-Discovery: GET /workers — Frontend kann alle Worker auflisten.
//   2) Ad-hoc-Trigger: POST /engagements/:id/workers/:workerKey/run — Operator
//      kann nachträglich einen einzelnen Worker gegen eine Entity laufen lassen,
//      ohne dafür ein Playbook bauen zu müssen. Das deckt Re-Runs, Trust-Re-
//      Validierung (z.B. nuclei nach Template-Update) und gezielte Forensik ab.
//
// Wichtig: derselbe Trust- und Persistenz-Pfad wie Playbook-Runs (executeWorker).
// Authorization-Gate, OSINT-Budget, exit_code-Persistenz, Trust-Downgrade,
// Findings/Tech/Discovered-Entities — alles aus dem Shared Worker-Runner.

import type { Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { database } from "@/db";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { entityService } from "@/lib/security/entities/entity.service";
import {
    engagementEntities,
    engagements,
    workerRuns,
} from "@/db/individual/individual-schema";
import { executeWorker } from "@/lib/security/workers/worker-runner";
import { getWorker, listWorkers } from "@/lib/security/workers/worker-registry";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { getUserIdFromRequest } from "@/util/utils";
import type {
    WorkerListQuery,
    WorkerRunListQuery,
    WorkerRunStartBody,
} from "./worker.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class WorkerController {
    /** GET /workers — Registry-Liste, optional gefiltert nach scope/targetKind. */
    async listRegistry(req: Request, res: Response) {
        try {
            const q = v<WorkerListQuery>(req, "query");
            let items = listWorkers();
            if (q.scope) items = items.filter((w) => w.requiredScope === q.scope);
            if (q.targetKind) {
                const targetKind = q.targetKind;
                items = items.filter((w) =>
                    // Probe-Target nur fürs Filter — id/value sind dummy.
                    w.isApplicable({ id: 0, value: "filter-probe", kind: targetKind }),
                );
            }
            const out = items.map((w) => ({
                jobKey: w.jobKey,
                requiredScope: w.requiredScope,
                description: w.description,
                defaultTimeoutMs: w.defaultTimeoutMs,
            }));
            return responseHandler(res, 200, undefined, out);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * POST /engagements/:id/workers/:workerKey/run
     * Body: { entityId, timeoutMs?, triggeredBy? }
     *
     * Synchron: wartet die Worker-Ausführung ab und gibt das fertige Result
     * zurück. Wir wollen für Ad-hoc-Aufrufe den vollen Trust-Trail sehen
     * (exit_code, error, findings) — Async wäre nur sinnvoll bei Multi-Target-
     * Playbooks. Caller kann ein eigenes Timeout setzen oder fire-and-forget.
     */
    async startRun(req: Request, res: Response) {
        const params = v<{ id: number; workerKey: string }>(req, "params");
        const body = v<WorkerRunStartBody>(req, "body");
        const userId = (await getUserIdFromRequest(req)) ?? null;

        try {
            // Worker-Lookup
            const worker = getWorker(params.workerKey as any);
            if (!worker) {
                return responseHandler(res, 404, `Worker not found: ${params.workerKey}`);
            }

            // Engagement laden
            const [engagement] = await database
                .select()
                .from(engagements)
                .where(eq(engagements.id, params.id))
                .limit(1);
            if (!engagement) return responseHandler(res, 404, "Engagement not found");
            if (engagement.archivedAt) return responseHandler(res, 400, "engagement_archived");

            // Entity laden + Engagement-Linkage prüfen
            const entity = await entityService.getById(body.entityId);
            if (!entity) return responseHandler(res, 404, "Entity not found");

            const [link] = await database
                .select({ id: engagementEntities.id })
                .from(engagementEntities)
                .where(
                    and(
                        eq(engagementEntities.engagementId, params.id),
                        eq(engagementEntities.entityId, body.entityId),
                    ),
                )
                .limit(1);
            if (!link) {
                return responseHandler(
                    res,
                    400,
                    "entity_not_linked_to_engagement",
                );
            }

            // Worker-Applicability gegen das Target prüfen — verhindert dass z.B.
            // ein Domain-Worker gegen eine Email-Entity gefeuert wird.
            const target = { id: entity.id, value: entity.canonicalKey, kind: entity.kind };
            if (!worker.isApplicable(target)) {
                return responseHandler(
                    res,
                    400,
                    `worker_not_applicable:${worker.jobKey}_does_not_accept_kind=${entity.kind}`,
                );
            }

            void auditLogService.log({
                action: "worker_run.start",
                actorUserId: userId,
                engagementId: params.id,
                targetType: "worker",
                targetId: 0,
                payload: {
                    workerKey: worker.jobKey,
                    entityId: entity.id,
                    triggeredBy: body.triggeredBy ?? "manual",
                },
            });

            const out = await executeWorker({
                worker,
                target,
                engagement,
                rootEntity: entity,
                timeoutMs: body.timeoutMs ?? worker.defaultTimeoutMs,
                playbookRunId: null,
                triggeredByUserId: userId,
            });

            void auditLogService.log({
                action: "worker_run.finish",
                actorUserId: userId,
                engagementId: params.id,
                targetType: "worker_run",
                targetId: out.workerRunId,
                payload: {
                    workerKey: worker.jobKey,
                    entityId: entity.id,
                    status: out.status,
                    findingsCreated: out.findingsCreated,
                    techCount: out.techCount,
                    discoveredEntities: out.newDiscoveredEntities,
                    exitCode: out.exitCode,
                    error: out.error,
                },
                success: out.status === "completed",
                errorMessage: out.error,
            });

            return responseHandler(res, 200, undefined, out);
        } catch (e: any) {
            void auditLogService.log({
                action: "worker_run.start_failed",
                actorUserId: userId,
                engagementId: params.id,
                payload: { workerKey: params.workerKey, reason: e?.message },
                success: false,
                errorMessage: e?.message,
            });
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /engagements/:id/workers/runs — alle worker-runs des Engagements. */
    async listRuns(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const q = v<WorkerRunListQuery>(req, "query");

            const conditions = [eq(workerRuns.engagementId, id)];
            if (q.workerKey) conditions.push(eq(workerRuns.workerKey, q.workerKey));
            if (q.status) conditions.push(eq(workerRuns.status, q.status));
            if (q.entityId) conditions.push(eq(workerRuns.entityId, q.entityId));

            const rows = await database
                .select()
                .from(workerRuns)
                .where(and(...conditions))
                .orderBy(desc(workerRuns.id))
                .limit(q.limit ?? 100);
            return responseHandler(res, 200, undefined, rows);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /engagements/:id/workers/runs/:runId */
    async getRun(req: Request, res: Response) {
        try {
            const { id, runId } = v<{ id: number; runId: number }>(req, "params");
            const [row] = await database
                .select()
                .from(workerRuns)
                .where(and(eq(workerRuns.id, runId), eq(workerRuns.engagementId, id)))
                .limit(1);
            if (!row) return responseHandler(res, 404, "Worker run not found");
            return responseHandler(res, 200, undefined, row);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const workerController = new WorkerController();

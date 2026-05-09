// Controller für die globalen Cross-Engagement-Endpoints.
// Permission-Layer: AuthControl.isAuthUser() (Solo-Operator-Tool, single-tenant).

import type { Request, Response } from "express";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { responseHandler } from "@/lib/communication";
import { activityFeedService, type ActivityEventKind } from "@/lib/security/audit/activity-feed.service";
import { aggregateGraphService } from "@/lib/security/intelligence/aggregate-graph.service";
import { findingService } from "@/lib/security/findings/finding.service";
import { workerRunsService } from "@/lib/security/workers/worker-runs.service";
import type {
    EntityKind,
    FindingCategory,
    FindingStatus,
    FindingTriageReason,
    Severity,
    WorkerRunStatus,
} from "@/db/individual/individual-schema";
import {
    allowedActivityKinds,
    allowedEntityKinds,
    allowedFindingCategory,
    allowedFindingStatus,
    allowedFindingTriageReason,
    allowedSeverities,
    allowedWorkerRunStatus,
    encodeCursor,
    parseNumericCsv,
    type ActivityQuery,
    type AggregateGraphQuery,
    type FindingsGlobalQuery,
    type WorkerRunsGlobalQuery,
} from "./global.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

function whitelist<T extends string>(values: string[] | undefined, allowed: readonly T[]): T[] | undefined {
    if (!values) return undefined;
    const out = values.filter((v): v is T => (allowed as readonly string[]).includes(v));
    return out.length > 0 ? out : undefined;
}

class GlobalController {
    /** GET /graph/aggregate */
    async aggregateGraph(req: Request, res: Response) {
        try {
            const q = v<AggregateGraphQuery>(req, "query");
            const out = await aggregateGraphService.build({
                engagementIds: parseNumericCsv(q.engagements),
                dedupe: q.dedupe ?? "canonicalKey",
                kinds: whitelist<EntityKind>(q.kinds, allowedEntityKinds),
                severities: whitelist<Severity>(q.severity, allowedSeverities),
                since: q.since,
                nodeLimit: q.nodeLimit,
            });
            return responseHandler(res, 200, undefined, out);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /activity */
    async activity(req: Request, res: Response) {
        try {
            const q = v<ActivityQuery>(req, "query");
            const out = await activityFeedService.list({
                since: q.since,
                until: q.until,
                engagementIds: parseNumericCsv(q.engagements),
                kinds: whitelist<ActivityEventKind>(q.kinds, allowedActivityKinds),
                limit: q.limit,
                cursor: q.cursor ?? null,
            });
            return responseHandler(res, 200, undefined, {
                events: out.events,
                nextCursor: encodeCursor(out.nextCursor),
                meta: {
                    totalApproximate: out.meta.totalApproximate,
                    sinceCovered: out.meta.sinceCovered?.toISOString() ?? null,
                },
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /findings (cross-engagement) */
    async findings(req: Request, res: Response) {
        try {
            const q = v<FindingsGlobalQuery>(req, "query");
            const out = await findingService.listGlobal({
                engagementIds: parseNumericCsv(q.engagements),
                severity: whitelist<Severity>(q.severity, allowedSeverities),
                status: whitelist<FindingStatus>(q.status, allowedFindingStatus),
                category: whitelist<FindingCategory>(q.category, allowedFindingCategory),
                triageReason: whitelist<FindingTriageReason>(q.triageReason, allowedFindingTriageReason),
                workerKey: q.workerKey,
                entityId: q.entityId,
                discoveredSince: q.discoveredSince,
                cursor: q.cursor ?? null,
                limit: q.limit,
            });
            return responseHandler(res, 200, undefined, {
                findings: out.items,
                nextCursor: encodeCursor(out.nextCursor),
                aggregations: out.aggregations,
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /** GET /workers/runs (cross-engagement) */
    async workerRuns(req: Request, res: Response) {
        try {
            const q = v<WorkerRunsGlobalQuery>(req, "query");
            const out = await workerRunsService.listGlobal({
                engagementIds: parseNumericCsv(q.engagements),
                statuses: whitelist<WorkerRunStatus>(q.status, allowedWorkerRunStatus),
                workerKeys: q.workerKey,
                since: q.since,
                cursor: q.cursor ?? null,
                limit: q.limit,
            });
            return responseHandler(res, 200, undefined, {
                runs: out.items,
                nextCursor: encodeCursor(out.nextCursor),
                meta: out.meta,
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const globalController = new GlobalController();

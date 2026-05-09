// Worker-Run-Service — globale Cross-Engagement Run-History für /workers/runs.
//
// Per-Engagement Listing existiert in worker.controller.listRuns; hier das
// gleiche, nur ohne required engagementId, mit cursor + running/pending counts
// für die Live-Status-Pille im Operator-FE.

import { and, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { database } from "@/db";
import {
    engagements,
    entities,
    workerRuns,
    type WorkerRun,
    type WorkerRunStatus,
} from "@/db/individual/individual-schema";

export type WorkerRunsListOpts = {
    engagementIds?: number[];
    statuses?: WorkerRunStatus[];
    workerKeys?: string[];
    since?: Date;
    cursor?: { at: Date; id: number } | null;
    limit?: number;
};

export type WorkerRunWithContext = WorkerRun & {
    engagementName: string;
    entityDisplayName: string | null;
};

export type WorkerRunsListResult = {
    items: WorkerRunWithContext[];
    nextCursor: { at: Date; id: number } | null;
    meta: {
        runningCount: number;
        pendingCount: number;
    };
};

export const workerRunsService = {
    async listGlobal(opts: WorkerRunsListOpts = {}): Promise<WorkerRunsListResult> {
        const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

        const conditions: SQL[] = [];
        if (opts.engagementIds && opts.engagementIds.length > 0) {
            conditions.push(inArray(workerRuns.engagementId, opts.engagementIds));
        }
        if (opts.statuses && opts.statuses.length > 0) {
            conditions.push(inArray(workerRuns.status, opts.statuses));
        }
        if (opts.workerKeys && opts.workerKeys.length > 0) {
            conditions.push(inArray(workerRuns.workerKey, opts.workerKeys));
        }
        if (opts.since) {
            conditions.push(gte(workerRuns.createdAt, opts.since));
        }
        if (opts.cursor) {
            const cur = opts.cursor;
            conditions.push(
                or(
                    lt(workerRuns.createdAt, cur.at),
                    and(eq(workerRuns.createdAt, cur.at), lt(workerRuns.id, cur.id)),
                )!,
            );
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const rows = await database
            .select({
                run: workerRuns,
                engagementName: engagements.name,
                entityDisplayName: entities.displayName,
            })
            .from(workerRuns)
            .leftJoin(engagements, eq(engagements.id, workerRuns.engagementId))
            .leftJoin(entities, eq(entities.id, workerRuns.entityId))
            .where(whereClause)
            .orderBy(desc(workerRuns.createdAt), desc(workerRuns.id))
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const sliced = hasMore ? rows.slice(0, limit) : rows;

        const items: WorkerRunWithContext[] = sliced.map((r) => ({
            ...r.run,
            engagementName: r.engagementName ?? "Unknown",
            entityDisplayName: r.entityDisplayName ?? null,
        }));

        let nextCursor: { at: Date; id: number } | null = null;
        if (hasMore && items.length > 0) {
            const last = items[items.length - 1];
            nextCursor = { at: last.createdAt, id: last.id };
        }

        // Live-Counters: nicht durch Cursor/Limit beeinflusst — gleiche Filter, ohne cursor.
        const liveConditions: SQL[] = [];
        if (opts.engagementIds && opts.engagementIds.length > 0) {
            liveConditions.push(inArray(workerRuns.engagementId, opts.engagementIds));
        }
        if (opts.workerKeys && opts.workerKeys.length > 0) {
            liveConditions.push(inArray(workerRuns.workerKey, opts.workerKeys));
        }

        const [counts] = await database
            .select({
                runningCount: sql<number>`cast(count(*) filter (where ${workerRuns.status} in ('running','provisioning')) as int)`,
                pendingCount: sql<number>`cast(count(*) filter (where ${workerRuns.status} = 'pending') as int)`,
            })
            .from(workerRuns)
            .where(liveConditions.length > 0 ? and(...liveConditions) : undefined);

        return {
            items,
            nextCursor,
            meta: {
                runningCount: counts?.runningCount ?? 0,
                pendingCount: counts?.pendingCount ?? 0,
            },
        };
    },
};

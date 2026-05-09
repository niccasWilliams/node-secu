// Activity-Feed-Service — chronologischer Cross-Engagement-Stream.
//
// Fasst Worker-Runs, Findings, Signal-Chains und Engagement-Statuswechsel
// zu EINEM ID-stabilen Event-Strom zusammen. ID-Schema: "<kind>:<row.id>"
// (z.B. "finding:42") — damit der FE-Client Updates per-Event mergen kann.
//
// Pagination: keyset über (occurredAt desc, id desc). Cursor ist das
// base64-encodierte JSON `{ at: ISO, id: number }` des letzten Events.

import { and, desc, eq, gte, inArray, lt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { database } from "@/db";
import {
    engagements,
    entities,
    findings,
    playbookRuns,
    secuSignalChainLog,
    securityAuditLog,
    workerRuns,
    type Severity,
} from "@/db/individual/individual-schema";

export type ActivityEventKind =
    | "worker_run"
    | "finding"
    | "signal_chain"
    | "engagement_status"
    | "playbook_run";

export type ActivityEvent = {
    id: string; // <kind>:<row-id>
    kind: ActivityEventKind;
    engagementId: number | null;
    engagementName: string | null;
    occurredAt: string; // ISO
    severity?: Severity;
    payload: Record<string, unknown>;
};

export type ActivityFeedOpts = {
    since?: Date;
    until?: Date;
    engagementIds?: number[];
    kinds?: ActivityEventKind[];
    limit?: number;
    cursor?: { at: Date; id: number } | null;
};

export type ActivityFeedResult = {
    events: ActivityEvent[];
    nextCursor: { at: Date; id: number } | null;
    meta: {
        totalApproximate: number;
        sinceCovered: Date | null;
    };
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const activityFeedService = {
    async list(opts: ActivityFeedOpts = {}): Promise<ActivityFeedResult> {
        const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
        const since = opts.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
        const until = opts.until ?? new Date();
        const kinds = opts.kinds && opts.kinds.length > 0
            ? new Set(opts.kinds)
            : new Set<ActivityEventKind>(["worker_run", "finding", "signal_chain", "engagement_status", "playbook_run"]);
        const engFilter = opts.engagementIds && opts.engagementIds.length > 0
            ? opts.engagementIds
            : null;

        // Wir holen pro Quelle bis zu (limit + cursor-overhead) Rows und mergen client-seitig —
        // einfacher als ein UNION-ALL+row_number-Konstrukt und schnell genug für FE-Polling.
        const fetchLimit = limit * 2 + 50;

        const cursorOlderThan = (col: AnyColumn, idCol: AnyColumn): SQL | undefined => {
            if (!opts.cursor) return undefined;
            // (occurredAt < cursor.at) OR (occurredAt = cursor.at AND id < cursor.id)
            return or(
                lt(col, opts.cursor.at),
                and(eq(col, opts.cursor.at), lt(idCol, opts.cursor.id)),
            );
        };

        const tasks: Array<Promise<ActivityEvent[]>> = [];

        if (kinds.has("worker_run")) {
            const ts = workerRuns.finishedAt;
            const conditions: SQL[] = [
                gte(sql`coalesce(${workerRuns.finishedAt}, ${workerRuns.createdAt})`, since),
                lt(sql`coalesce(${workerRuns.finishedAt}, ${workerRuns.createdAt})`, until),
            ];
            if (engFilter) conditions.push(inArray(workerRuns.engagementId, engFilter));
            // cursor: nur über finishedAt ≈ workerRuns.id-Tiebreaker
            if (opts.cursor) {
                conditions.push(
                    or(
                        lt(sql`coalesce(${workerRuns.finishedAt}, ${workerRuns.createdAt})`, opts.cursor.at),
                        and(
                            eq(sql`coalesce(${workerRuns.finishedAt}, ${workerRuns.createdAt})`, opts.cursor.at),
                            lt(workerRuns.id, opts.cursor.id),
                        ),
                    )!,
                );
            }
            tasks.push(
                database
                    .select({
                        id: workerRuns.id,
                        engagementId: workerRuns.engagementId,
                        engagementName: engagements.name,
                        workerKey: workerRuns.workerKey,
                        status: workerRuns.status,
                        entityId: workerRuns.entityId,
                        entityDisplayName: entities.displayName,
                        durationMs: workerRuns.durationMs,
                        finishedAt: workerRuns.finishedAt,
                        createdAt: workerRuns.createdAt,
                        error: workerRuns.error,
                    })
                    .from(workerRuns)
                    .leftJoin(engagements, eq(engagements.id, workerRuns.engagementId))
                    .leftJoin(entities, eq(entities.id, workerRuns.entityId))
                    .where(and(...conditions))
                    .orderBy(desc(ts), desc(workerRuns.id))
                    .limit(fetchLimit)
                    .then((rows): ActivityEvent[] =>
                        rows.map((r) => ({
                            id: `worker_run:${r.id}`,
                            kind: "worker_run",
                            engagementId: r.engagementId,
                            engagementName: r.engagementName ?? null,
                            occurredAt: (r.finishedAt ?? r.createdAt).toISOString(),
                            payload: {
                                workerRunId: r.id,
                                workerKey: r.workerKey,
                                status: r.status,
                                entityId: r.entityId,
                                entityDisplayName: r.entityDisplayName ?? null,
                                durationMs: r.durationMs,
                                error: r.error,
                            },
                        })),
                    ),
            );
        }

        if (kinds.has("finding")) {
            const conditions: SQL[] = [gte(findings.discoveredAt, since), lt(findings.discoveredAt, until)];
            if (engFilter) conditions.push(inArray(findings.engagementId, engFilter));
            if (opts.cursor) {
                const c = cursorOlderThan(findings.discoveredAt, findings.id);
                if (c) conditions.push(c);
            }
            tasks.push(
                database
                    .select({
                        id: findings.id,
                        engagementId: findings.engagementId,
                        engagementName: engagements.name,
                        title: findings.title,
                        severity: findings.severity,
                        category: findings.category,
                        status: findings.status,
                        entityId: findings.entityId,
                        entityDisplayName: entities.displayName,
                        discoveredAt: findings.discoveredAt,
                    })
                    .from(findings)
                    .leftJoin(engagements, eq(engagements.id, findings.engagementId))
                    .leftJoin(entities, eq(entities.id, findings.entityId))
                    .where(and(...conditions))
                    .orderBy(desc(findings.discoveredAt), desc(findings.id))
                    .limit(fetchLimit)
                    .then((rows): ActivityEvent[] =>
                        rows.map((r) => ({
                            id: `finding:${r.id}`,
                            kind: "finding",
                            engagementId: r.engagementId,
                            engagementName: r.engagementName ?? null,
                            occurredAt: r.discoveredAt.toISOString(),
                            severity: r.severity,
                            payload: {
                                findingId: r.id,
                                title: r.title,
                                severity: r.severity,
                                category: r.category,
                                status: r.status,
                                entityId: r.entityId,
                                entityDisplayName: r.entityDisplayName ?? null,
                            },
                        })),
                    ),
            );
        }

        if (kinds.has("signal_chain")) {
            const conditions: SQL[] = [
                gte(secuSignalChainLog.startedAt, since),
                lt(secuSignalChainLog.startedAt, until),
            ];
            if (engFilter) conditions.push(inArray(secuSignalChainLog.engagementId, engFilter));
            if (opts.cursor) {
                const c = cursorOlderThan(secuSignalChainLog.startedAt, secuSignalChainLog.id);
                if (c) conditions.push(c);
            }
            tasks.push(
                database
                    .select({
                        id: secuSignalChainLog.id,
                        engagementId: secuSignalChainLog.engagementId,
                        engagementName: engagements.name,
                        rootEntityId: secuSignalChainLog.rootEntityId,
                        triggeredBy: secuSignalChainLog.triggeredBy,
                        signalChain: secuSignalChainLog.signalChain,
                        startedAt: secuSignalChainLog.startedAt,
                        finishedAt: secuSignalChainLog.finishedAt,
                    })
                    .from(secuSignalChainLog)
                    .leftJoin(engagements, eq(engagements.id, secuSignalChainLog.engagementId))
                    .where(and(...conditions))
                    .orderBy(desc(secuSignalChainLog.startedAt), desc(secuSignalChainLog.id))
                    .limit(fetchLimit)
                    .then((rows): ActivityEvent[] =>
                        rows.map((r) => ({
                            id: `signal_chain:${r.id}`,
                            kind: "signal_chain",
                            engagementId: r.engagementId,
                            engagementName: r.engagementName ?? null,
                            occurredAt: r.startedAt.toISOString(),
                            payload: {
                                chainId: r.id,
                                triggeredBy: r.triggeredBy,
                                rootEntityId: r.rootEntityId,
                                hops: Array.isArray(r.signalChain) ? r.signalChain.length : 0,
                                finishedAt: r.finishedAt?.toISOString() ?? null,
                            },
                        })),
                    ),
            );
        }

        if (kinds.has("engagement_status")) {
            // Status-Wechsel werden über audit-log "engagement.status_change" gefangen.
            // Falls die action-Konvention in der Codebasis variiert, fangen wir
            // mehrere ein (engagement.status, engagement.archive, engagement.create).
            const watched = ["engagement.status_change", "engagement.archive", "engagement.create", "engagement.update"];
            const conditions: SQL[] = [
                gte(securityAuditLog.createdAt, since),
                lt(securityAuditLog.createdAt, until),
                inArray(securityAuditLog.action, watched),
            ];
            if (engFilter) conditions.push(inArray(securityAuditLog.engagementId, engFilter));
            if (opts.cursor) {
                const c = cursorOlderThan(securityAuditLog.createdAt, securityAuditLog.id);
                if (c) conditions.push(c);
            }
            tasks.push(
                database
                    .select({
                        id: securityAuditLog.id,
                        engagementId: securityAuditLog.engagementId,
                        engagementName: engagements.name,
                        action: securityAuditLog.action,
                        actorUserId: securityAuditLog.actorUserId,
                        payload: securityAuditLog.payload,
                        createdAt: securityAuditLog.createdAt,
                    })
                    .from(securityAuditLog)
                    .leftJoin(engagements, eq(engagements.id, securityAuditLog.engagementId))
                    .where(and(...conditions))
                    .orderBy(desc(securityAuditLog.createdAt), desc(securityAuditLog.id))
                    .limit(fetchLimit)
                    .then((rows): ActivityEvent[] =>
                        rows.map((r) => ({
                            id: `engagement_status:${r.id}`,
                            kind: "engagement_status",
                            engagementId: r.engagementId,
                            engagementName: r.engagementName ?? null,
                            occurredAt: r.createdAt.toISOString(),
                            payload: {
                                action: r.action,
                                actorUserId: r.actorUserId,
                                detail: r.payload ?? {},
                            },
                        })),
                    ),
            );
        }

        if (kinds.has("playbook_run")) {
            const ts = playbookRuns.finishedAt;
            const conditions: SQL[] = [
                gte(sql`coalesce(${playbookRuns.finishedAt}, ${playbookRuns.createdAt})`, since),
                lt(sql`coalesce(${playbookRuns.finishedAt}, ${playbookRuns.createdAt})`, until),
            ];
            if (engFilter) conditions.push(inArray(playbookRuns.engagementId, engFilter));
            if (opts.cursor) {
                conditions.push(
                    or(
                        lt(sql`coalesce(${playbookRuns.finishedAt}, ${playbookRuns.createdAt})`, opts.cursor.at),
                        and(
                            eq(sql`coalesce(${playbookRuns.finishedAt}, ${playbookRuns.createdAt})`, opts.cursor.at),
                            lt(playbookRuns.id, opts.cursor.id),
                        ),
                    )!,
                );
            }
            tasks.push(
                database
                    .select({
                        id: playbookRuns.id,
                        engagementId: playbookRuns.engagementId,
                        engagementName: engagements.name,
                        playbookKey: playbookRuns.playbookKey,
                        status: playbookRuns.status,
                        triggeredBy: playbookRuns.triggeredBy,
                        finishedAt: playbookRuns.finishedAt,
                        createdAt: playbookRuns.createdAt,
                    })
                    .from(playbookRuns)
                    .leftJoin(engagements, eq(engagements.id, playbookRuns.engagementId))
                    .where(and(...conditions))
                    .orderBy(desc(ts), desc(playbookRuns.id))
                    .limit(fetchLimit)
                    .then((rows): ActivityEvent[] =>
                        rows.map((r) => ({
                            id: `playbook_run:${r.id}`,
                            kind: "playbook_run",
                            engagementId: r.engagementId,
                            engagementName: r.engagementName ?? null,
                            occurredAt: (r.finishedAt ?? r.createdAt).toISOString(),
                            payload: {
                                playbookRunId: r.id,
                                playbookKey: r.playbookKey,
                                status: r.status,
                                triggeredBy: r.triggeredBy,
                            },
                        })),
                    ),
            );
        }

        const sources = await Promise.all(tasks);
        const merged = sources.flat();

        // Stable secondary sort durch numeric-id-Tiebreaker
        merged.sort((a, b) => {
            const at = b.occurredAt.localeCompare(a.occurredAt);
            if (at !== 0) return at;
            return b.id.localeCompare(a.id);
        });

        const sliced = merged.slice(0, limit);
        const hasMore = merged.length > limit;

        let nextCursor: { at: Date; id: number } | null = null;
        if (hasMore && sliced.length > 0) {
            const last = sliced[sliced.length - 1];
            const numericId = Number.parseInt(last.id.split(":")[1] ?? "0", 10);
            nextCursor = { at: new Date(last.occurredAt), id: numericId };
        }

        return {
            events: sliced,
            nextCursor,
            meta: {
                totalApproximate: merged.length,
                sinceCovered: since,
            },
        };
    },
};

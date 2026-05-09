// Finding-Service — engagement-lokale Findings persistieren mit deterministischer
// Dedup. Ein Finding ist eindeutig pro `(engagement_id, fingerprint)` (siehe
// `secu_findings`-Schema). Ein Re-Run derselben Worker-Konfiguration auf
// demselben Target erzeugt also keine Duplikate, sondern wird vom Service
// als "deduped" zurückgemeldet.

import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { database } from "@/db";
import {
    engagements,
    entities,
    findingComments,
    findings,
    workerRuns,
    type Finding,
    type FindingCategory,
    type FindingComment,
    type FindingStatus,
    type FindingTriageReason,
    type NewFindingComment,
    type Severity,
} from "@/db/individual/individual-schema";
import { users } from "@/db/schema";
import type { FindingDraft } from "../workers/worker.types";
import { buildFindingFingerprint } from "./fingerprint";
import { secuEventBus } from "../rules/event-bus";

const RESOLVED_STATUSES: ReadonlyArray<FindingStatus> = ["fixed", "wont_fix", "false_positive"] as const;

export type PersistDraftInput = {
    engagementId: number;
    entityId: number | null;
    workerRunId: number | null;
    draft: FindingDraft;
};

export type PersistDraftResult =
    | { kind: "created"; finding: Finding }
    | { kind: "deduped"; finding: Finding };

export const findingService = {
    /**
     * Persistiert einen Worker-Finding-Draft und liefert das DB-Row + ob es ein
     * Duplikat war. Bei Duplikat wird `last_observed_at` (über `discoveredAt`)
     * NICHT zurückgesetzt — das ursprüngliche Erst-Entdeckungsdatum bleibt
     * erhalten; stattdessen wird `raw_data.lastSeenAt` getoucht.
     */
    async persistDraft(input: PersistDraftInput): Promise<PersistDraftResult> {
        const fingerprint = buildFindingFingerprint(input.draft.fingerprintInputs);

        const rawData: Record<string, unknown> = {
            ...(input.draft.evidence ?? {}),
            workerRunId: input.workerRunId ?? null,
            lastSeenAt: new Date().toISOString(),
        };

        const inserted = await database
            .insert(findings)
            .values({
                engagementId: input.engagementId,
                entityId: input.entityId ?? null,
                workerRunId: input.workerRunId ?? null,
                fingerprint,
                severity: input.draft.severity,
                category: input.draft.category,
                title: input.draft.title.slice(0, 256),
                description: input.draft.description,
                rawData,
                recommendation: input.draft.recommendation ?? null,
                cveIds: input.draft.cveIds ?? [],
                cvssScore: input.draft.cvssScore ?? null,
            })
            .onConflictDoNothing({
                target: [findings.engagementId, findings.fingerprint],
            })
            .returning();

        if (inserted.length > 0) {
            const finding = inserted[0];
            void publishFindingCreated(finding);
            return { kind: "created", finding };
        }

        // Duplikat: bestehendes Finding holen und last-seen patchen.
        const [existing] = await database
            .select()
            .from(findings)
            .where(
                and(
                    eq(findings.engagementId, input.engagementId),
                    eq(findings.fingerprint, fingerprint),
                ),
            )
            .limit(1);

        if (existing) {
            const mergedRaw: Record<string, unknown> = {
                ...((existing.rawData as Record<string, unknown> | null) ?? {}),
                lastSeenAt: new Date().toISOString(),
            };
            await database
                .update(findings)
                .set({ rawData: mergedRaw })
                .where(eq(findings.id, existing.id));
            return { kind: "deduped", finding: { ...existing, rawData: mergedRaw } as Finding };
        }

        // Sehr unwahrscheinlich (Race + Conflict + Read-Miss). Sicherheits-Reraise.
        throw new Error("finding.persistDraft: insert conflicted but lookup empty");
    },

    async listForEngagement(
        engagementId: number,
        opts?: {
            status?: FindingStatus;
            severity?: Severity;
            category?: FindingCategory;
            triageReason?: FindingTriageReason;
            workerKey?: string;
            entityId?: number;
            limit?: number;
            offset?: number;
            sortBy?: "discoveredAt" | "severity" | "status" | "category";
            order?: "asc" | "desc";
            search?: string;
        },
    ): Promise<Array<Finding & { entity: typeof entities.$inferSelect | null; workerRun: { id: number; workerKey: string; status: string } | null }>> {
        const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000);
        const offset = Math.max(opts?.offset ?? 0, 0);
        const conditions: SQL[] = [eq(findings.engagementId, engagementId)];
        if (opts?.status) conditions.push(eq(findings.status, opts.status));
        if (opts?.severity) conditions.push(eq(findings.severity, opts.severity));
        if (opts?.category) conditions.push(eq(findings.category, opts.category));
        if (opts?.triageReason) conditions.push(eq(findings.triageReason, opts.triageReason));
        if (opts?.entityId) conditions.push(eq(findings.entityId, opts.entityId));
        if (opts?.workerKey) conditions.push(eq(workerRuns.workerKey, opts.workerKey));
        if (opts?.search && opts.search.trim()) {
            const term = `%${opts.search.trim()}%`;
            conditions.push(sql`(${findings.title} ILIKE ${term} OR ${findings.description} ILIKE ${term})`);
        }

        const sortColumn = (() => {
            switch (opts?.sortBy) {
                case "severity": return findings.severity;
                case "status": return findings.status;
                case "category": return findings.category;
                case "discoveredAt":
                default: return findings.discoveredAt;
            }
        })();
        const direction = opts?.order === "asc" ? asc(sortColumn) : desc(sortColumn);

        const rows = await database
            .select({
                finding: findings,
                entity: entities,
                workerRun: {
                    id: workerRuns.id,
                    workerKey: workerRuns.workerKey,
                    status: workerRuns.status,
                },
            })
            .from(findings)
            .leftJoin(entities, eq(entities.id, findings.entityId))
            .leftJoin(workerRuns, eq(workerRuns.id, findings.workerRunId))
            .where(and(...conditions))
            .orderBy(direction)
            .limit(limit)
            .offset(offset);

        return rows.map((row) => ({
            ...row.finding,
            entity: row.entity ?? null,
            workerRun: row.workerRun?.id ? row.workerRun : null,
        }));
    },

    async getInEngagement(engagementId: number, findingId: number): Promise<(Finding & {
        entity: typeof entities.$inferSelect | null;
        workerRun: { id: number; workerKey: string; status: string } | null;
    }) | null> {
        const [row] = await database
            .select({
                finding: findings,
                entity: entities,
                workerRun: {
                    id: workerRuns.id,
                    workerKey: workerRuns.workerKey,
                    status: workerRuns.status,
                },
            })
            .from(findings)
            .leftJoin(entities, eq(entities.id, findings.entityId))
            .leftJoin(workerRuns, eq(workerRuns.id, findings.workerRunId))
            .where(and(eq(findings.engagementId, engagementId), eq(findings.id, findingId)))
            .limit(1);
        if (!row) return null;
        return {
            ...row.finding,
            entity: row.entity ?? null,
            workerRun: row.workerRun?.id ? row.workerRun : null,
        };
    },

    async updateTriage(input: {
        engagementId: number;
        findingId: number;
        status: FindingStatus;
        triageReason?: FindingTriageReason | null;
        triageNote?: string | null;
        resolutionNote?: string | null;
        actorUserId: number | null;
    }): Promise<Finding | null> {
        // Vor dem Patch: previousStatus für das WS-Event lesen.
        const [prev] = await database
            .select({ status: findings.status, severity: findings.severity, category: findings.category, entityId: findings.entityId })
            .from(findings)
            .where(and(eq(findings.engagementId, input.engagementId), eq(findings.id, input.findingId)))
            .limit(1);

        const isResolved = RESOLVED_STATUSES.includes(input.status);
        const patch: Partial<typeof findings.$inferInsert> = {
            status: input.status,
            triageReason: input.triageReason ?? null,
            triageNote: input.triageNote ?? null,
            resolutionNote: isResolved ? (input.resolutionNote ?? null) : null,
            resolvedAt: isResolved ? new Date() : null,
            resolvedBy: isResolved ? input.actorUserId : null,
        };

        const [updated] = await database
            .update(findings)
            .set(patch)
            .where(and(eq(findings.engagementId, input.engagementId), eq(findings.id, input.findingId)))
            .returning();

        if (updated && prev && prev.status !== input.status) {
            secuEventBus.publish({
                type: "finding.updated",
                findingId: updated.id,
                engagementId: updated.engagementId,
                entityId: updated.entityId,
                severity: updated.severity,
                category: updated.category,
                previousStatus: prev.status,
                newStatus: updated.status,
                actorUserId: input.actorUserId,
            });
        }
        return updated ?? null;
    },

    /** Backwards-compat: nur Status-Patch ohne Begründung. */
    async updateStatus(input: {
        engagementId: number;
        findingId: number;
        status: FindingStatus;
        actorUserId?: number | null;
    }): Promise<Finding | null> {
        return this.updateTriage({
            engagementId: input.engagementId,
            findingId: input.findingId,
            status: input.status,
            actorUserId: input.actorUserId ?? null,
        });
    },

    // ─── Comments ──────────────────────────────────────────────────────────

    async listComments(
        engagementId: number,
        findingId: number,
    ): Promise<Array<FindingComment & { author: { id: number; email: string | null; firstname: string | null; lastname: string | null } | null }>> {
        // Schutz gegen Cross-Engagement-Leak: nur Comments wenn das Finding wirklich
        // im angefragten Engagement liegt.
        const finding = await this.getInEngagement(engagementId, findingId);
        if (!finding) return [];
        const rows = await database
            .select({
                comment: findingComments,
                author: {
                    id: users.id,
                    email: users.email,
                    firstname: users.firstName,
                    lastname: users.lastName,
                },
            })
            .from(findingComments)
            .leftJoin(users, eq(users.id, findingComments.userId))
            .where(eq(findingComments.findingId, findingId))
            .orderBy(asc(findingComments.createdAt));
        return rows.map((r) => ({
            ...r.comment,
            author: r.author?.id ? r.author : null,
        }));
    },

    async createComment(input: {
        engagementId: number;
        findingId: number;
        userId: number | null;
        body: string;
    }): Promise<FindingComment | null> {
        const finding = await this.getInEngagement(input.engagementId, input.findingId);
        if (!finding) return null;
        const row: NewFindingComment = {
            findingId: input.findingId,
            userId: input.userId,
            body: input.body,
        };
        const [inserted] = await database.insert(findingComments).values(row).returning();
        if (inserted) {
            secuEventBus.publish({
                type: "finding.comment_added",
                findingId: input.findingId,
                engagementId: input.engagementId,
                commentId: inserted.id,
                excerpt: inserted.body.slice(0, 80),
                actorUserId: input.userId,
            });
        }
        return inserted ?? null;
    },

    async deleteComment(input: {
        engagementId: number;
        findingId: number;
        commentId: number;
    }): Promise<boolean> {
        const finding = await this.getInEngagement(input.engagementId, input.findingId);
        if (!finding) return false;
        const result = await database
            .delete(findingComments)
            .where(and(eq(findingComments.id, input.commentId), eq(findingComments.findingId, input.findingId)))
            .returning({ id: findingComments.id });
        return result.length > 0;
    },

    async countForPlaybookRun(playbookRunId: number): Promise<number> {
        const [row] = await database
            .select({ cnt: sql<number>`cast(count(*) as int)` })
            .from(findings)
            .innerJoin(workerRuns, eq(workerRuns.id, findings.workerRunId))
            .where(eq(workerRuns.playbookRunId, playbookRunId));
        return row?.cnt ?? 0;
    },

    async listRawForEngagement(
        engagementId: number,
        opts?: { status?: FindingStatus; limit?: number },
    ): Promise<Finding[]> {
        const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 1000);
        const conditions = [eq(findings.engagementId, engagementId)];
        if (opts?.status) conditions.push(eq(findings.status, opts.status));
        return database
            .select()
            .from(findings)
            .where(and(...conditions))
            .orderBy(sql`secu_findings.discovered_at desc`)
            .limit(limit);
    },

    async countByWorkerRun(workerRunId: number): Promise<number> {
        const [row] = await database
            .select({ cnt: sql<number>`cast(count(*) as int)` })
            .from(findings)
            .where(eq(findings.workerRunId, workerRunId));
        return row?.cnt ?? 0;
    },

    /**
     * Cross-Engagement-Findings für die globale Triage-Inbox.
     * Kein engagementId-Pflichtfilter — optional eingrenzbar.
     * Liefert zusätzlich Aggregations (severity/status/category) damit das
     * FE-Dashboard ohne Round-Trip Severity-Tiles bauen kann.
     */
    async listGlobal(opts?: {
        engagementIds?: number[];
        status?: FindingStatus[];
        severity?: Severity[];
        category?: FindingCategory[];
        triageReason?: FindingTriageReason[];
        workerKey?: string[];
        entityId?: number;
        discoveredSince?: Date;
        cursor?: { at: Date; id: number } | null;
        limit?: number;
        sortBy?: "discoveredAt" | "severity" | "status" | "category";
        order?: "asc" | "desc";
    }): Promise<{
        items: Array<Finding & {
            entity: typeof entities.$inferSelect | null;
            workerRun: { id: number; workerKey: string; status: string } | null;
            engagementName: string;
            entityDisplayName: string | null;
        }>;
        nextCursor: { at: Date; id: number } | null;
        aggregations: {
            bySeverity: Record<Severity, number>;
            byStatus: Record<FindingStatus, number>;
            byCategory: Record<string, number>;
        };
    }> {
        const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
        const conditions: SQL[] = [];
        if (opts?.engagementIds && opts.engagementIds.length > 0) {
            conditions.push(sql`${findings.engagementId} = ANY(${opts.engagementIds})`);
        }
        if (opts?.status && opts.status.length > 0) {
            conditions.push(sql`${findings.status} = ANY(${opts.status})`);
        }
        if (opts?.severity && opts.severity.length > 0) {
            conditions.push(sql`${findings.severity} = ANY(${opts.severity})`);
        }
        if (opts?.category && opts.category.length > 0) {
            conditions.push(sql`${findings.category} = ANY(${opts.category})`);
        }
        if (opts?.triageReason && opts.triageReason.length > 0) {
            conditions.push(sql`${findings.triageReason} = ANY(${opts.triageReason})`);
        }
        if (opts?.entityId) conditions.push(eq(findings.entityId, opts.entityId));
        if (opts?.discoveredSince) conditions.push(sql`${findings.discoveredAt} >= ${opts.discoveredSince}`);
        if (opts?.workerKey && opts.workerKey.length > 0) {
            conditions.push(sql`${workerRuns.workerKey} = ANY(${opts.workerKey})`);
        }

        // Cursor (nur für discoveredAt-sort-desc — sortierte Spalten ändern Cursor-Semantik)
        const sortBy = opts?.sortBy ?? "discoveredAt";
        const order = opts?.order ?? "desc";
        if (opts?.cursor && sortBy === "discoveredAt" && order === "desc") {
            conditions.push(
                sql`(${findings.discoveredAt} < ${opts.cursor.at} OR (${findings.discoveredAt} = ${opts.cursor.at} AND ${findings.id} < ${opts.cursor.id}))`,
            );
        }

        const sortColumn = (() => {
            switch (sortBy) {
                case "severity": return findings.severity;
                case "status": return findings.status;
                case "category": return findings.category;
                case "discoveredAt":
                default: return findings.discoveredAt;
            }
        })();
        const direction = order === "asc" ? asc(sortColumn) : desc(sortColumn);

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const itemsRows = await database
            .select({
                finding: findings,
                entity: entities,
                workerRun: {
                    id: workerRuns.id,
                    workerKey: workerRuns.workerKey,
                    status: workerRuns.status,
                },
                engagementName: engagements.name,
            })
            .from(findings)
            .leftJoin(entities, eq(entities.id, findings.entityId))
            .leftJoin(workerRuns, eq(workerRuns.id, findings.workerRunId))
            .leftJoin(engagements, eq(engagements.id, findings.engagementId))
            .where(whereClause)
            .orderBy(direction, desc(findings.id))
            .limit(limit + 1);

        const hasMore = itemsRows.length > limit;
        const sliced = hasMore ? itemsRows.slice(0, limit) : itemsRows;

        const items = sliced.map((row) => ({
            ...row.finding,
            entity: row.entity ?? null,
            workerRun: row.workerRun?.id ? row.workerRun : null,
            engagementName: row.engagementName ?? "Unknown",
            entityDisplayName: row.entity?.displayName ?? null,
        }));

        let nextCursor: { at: Date; id: number } | null = null;
        if (hasMore && items.length > 0 && sortBy === "discoveredAt" && order === "desc") {
            const last = items[items.length - 1];
            nextCursor = { at: last.discoveredAt, id: last.id };
        }

        // Aggregations laufen separat parallel — dieselbe WHERE, aber ohne Cursor.
        const aggConditions = conditions.filter((c) => {
            const str = String((c as { queryChunks?: unknown }).queryChunks ?? c);
            // Cursor-Filter rausziehen (heuristisch über discoveredAt + id Kombination)
            return !str.includes("discovered_at < ");
        });
        // Sicherer: Aggregate ohne Cursor erneut bauen.
        const aggBaseConditions: SQL[] = [];
        if (opts?.engagementIds && opts.engagementIds.length > 0) {
            aggBaseConditions.push(sql`${findings.engagementId} = ANY(${opts.engagementIds})`);
        }
        if (opts?.status && opts.status.length > 0) {
            aggBaseConditions.push(sql`${findings.status} = ANY(${opts.status})`);
        }
        if (opts?.severity && opts.severity.length > 0) {
            aggBaseConditions.push(sql`${findings.severity} = ANY(${opts.severity})`);
        }
        if (opts?.category && opts.category.length > 0) {
            aggBaseConditions.push(sql`${findings.category} = ANY(${opts.category})`);
        }
        if (opts?.triageReason && opts.triageReason.length > 0) {
            aggBaseConditions.push(sql`${findings.triageReason} = ANY(${opts.triageReason})`);
        }
        if (opts?.entityId) aggBaseConditions.push(eq(findings.entityId, opts.entityId));
        if (opts?.discoveredSince) aggBaseConditions.push(sql`${findings.discoveredAt} >= ${opts.discoveredSince}`);

        const needsWorkerJoin = opts?.workerKey && opts.workerKey.length > 0;
        const aggWhere = aggBaseConditions.length > 0 ? and(...aggBaseConditions) : undefined;

        const baseAgg = needsWorkerJoin
            ? database
                  .select({
                      severity: findings.severity,
                      status: findings.status,
                      category: findings.category,
                      cnt: sql<number>`cast(count(*) as int)`,
                  })
                  .from(findings)
                  .leftJoin(workerRuns, eq(workerRuns.id, findings.workerRunId))
                  .where(
                      and(
                          aggWhere,
                          sql`${workerRuns.workerKey} = ANY(${opts!.workerKey!})`,
                      )!,
                  )
                  .groupBy(findings.severity, findings.status, findings.category)
            : database
                  .select({
                      severity: findings.severity,
                      status: findings.status,
                      category: findings.category,
                      cnt: sql<number>`cast(count(*) as int)`,
                  })
                  .from(findings)
                  .where(aggWhere)
                  .groupBy(findings.severity, findings.status, findings.category);

        const aggRows = await baseAgg;

        const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        const byStatus: Record<FindingStatus, number> = {
            open: 0, triaged: 0, confirmed: 0, false_positive: 0, wont_fix: 0, fixed: 0,
        };
        const byCategory: Record<string, number> = {};
        for (const r of aggRows) {
            bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + r.cnt;
            byStatus[r.status] = (byStatus[r.status] ?? 0) + r.cnt;
            byCategory[r.category] = (byCategory[r.category] ?? 0) + r.cnt;
        }

        void aggConditions; // silenced — kept for diff-readability with future refactors
        return { items, nextCursor, aggregations: { bySeverity, byStatus, byCategory } };
    },
};

async function publishFindingCreated(finding: Finding): Promise<void> {
    try {
        const [eng] = await database
            .select({ kind: engagements.kind })
            .from(engagements)
            .where(eq(engagements.id, finding.engagementId))
            .limit(1);
        let entityKind: string | null = null;
        if (finding.entityId) {
            const [ent] = await database
                .select({ kind: entities.kind })
                .from(entities)
                .where(eq(entities.id, finding.entityId))
                .limit(1);
            entityKind = ent?.kind ?? null;
        }
        secuEventBus.publish({
            type: "finding.created",
            findingId: finding.id,
            engagementId: finding.engagementId,
            engagementKind: eng?.kind ?? null,
            entityId: finding.entityId,
            entityKind: entityKind as never,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            fingerprint: finding.fingerprint,
            cveIds: (finding.cveIds ?? []) as string[],
            workerRunId: finding.workerRunId ?? null,
        });
    } catch (err) {
        console.error("[finding.service] event publish failed", { findingId: finding.id, err: (err as Error).message });
    }
}

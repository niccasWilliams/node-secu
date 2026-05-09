// Entity-Service — globale Identitäts-Schicht.
//
// Eine Entity (Domain, Person, Org, IP, …) existiert genau einmal pro
// (kind, canonical_key). `upsert` ist das Standard-Werkzeug — neu anlegen
// oder bestehende zurückgeben + last_seen_at touchen. Engagements verlinken
// Entities über die `engagement_entities`-Tabelle (siehe engagement.service).

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { database } from "@/db";
import {
    entities,
    entityAuthorizations,
    entityRelationships,
    entityTags,
    engagementEntities,
    engagements,
    findings as findingsTable,
    workerRuns as workerRunsTable,
    type Entity,
    type EntityAuthorization,
    type EntityKind,
    type Finding,
    type NewEntity,
    type WorkerRun,
} from "@/db/individual/individual-schema";
import { buildCanonicalKey, type CanonicalKeyInput } from "./canonical-key";
import { secuEventBus } from "../rules/event-bus";

export type EntityUpsertInput = {
    kind: EntityKind;
    /** Anzeigename — wird bei Re-Upsert nur aktualisiert, wenn explicit gesetzt. */
    displayName?: string;
    /** Wie der canonical_key abgeleitet wird. */
    canonical: CanonicalKeyInput;
    /** Beliebige zusätzliche Attribute (kind-spezifisch). */
    data?: Record<string, unknown>;
    /**
     * Sprint 1.3 (features.md §2.4) — Optionaler Run-Kontext, wird nur ans
     * Event-Bus-Payload weitergereicht (sourcePlaybookRunId), damit der
     * Rule-Evaluator Hop-Tracking machen kann. Manuelle Aufrufe (REST
     * Controller, Test-Setup) lassen das undefined.
     */
    sourceContext?: { playbookRunId?: number | null; engagementId?: number | null };
};

export type EntitySearchFilters = {
    kind?: EntityKind | EntityKind[];
    /** Volltext über display_name + canonical_key. */
    q?: string;
    limit?: number;
    offset?: number;
    /**
     * Sprint 1.2 (features.md §2.2) — Default: speculative=true Entities werden
     * nicht im Standard-Listing zurückgegeben (Hypothesen sind Researcher-Material,
     * keine first-class Identitäten). Setze auf true, um sie einzuschließen.
     * Entities ohne Provenance-Block gelten als faktisch und sind immer enthalten.
     */
    includeSpeculative?: boolean;
};

export type EntityWithEngagementCount = Entity & {
    engagementCount: number;
    tags: string[];
};

export const entityService = {
    /**
     * Legt eine Entity an oder liefert die existierende für `(kind, canonical_key)`.
     * Touched `last_seen_at`. `displayName` wird nur überschrieben, wenn explizit angegeben.
     */
    async upsert(input: EntityUpsertInput): Promise<Entity> {
        const canonicalKey = buildCanonicalKey(input.canonical);
        const displayName = (input.displayName ?? input.canonical.primaryValue).trim();
        if (!displayName) throw new Error("entity.upsert: displayName/primaryValue required");

        const existing = await database
            .select()
            .from(entities)
            .where(and(eq(entities.kind, input.kind), eq(entities.canonicalKey, canonicalKey)))
            .limit(1);

        const sourcePlaybookRunId = input.sourceContext?.playbookRunId ?? undefined;
        const sourceEngagementId = input.sourceContext?.engagementId ?? undefined;

        if (existing.length > 0) {
            const current = existing[0];
            const merged = { ...(current.data ?? {}), ...(input.data ?? {}) };
            const [updated] = await database
                .update(entities)
                .set({
                    lastSeenAt: new Date(),
                    displayName: input.displayName ? displayName : current.displayName,
                    data: merged,
                })
                .where(eq(entities.id, current.id))
                .returning();
            secuEventBus.publish({
                type: "entity.updated",
                entityId: updated.id,
                kind: updated.kind,
                canonicalKey: updated.canonicalKey,
                displayName: updated.displayName,
                data: (updated.data ?? {}) as Record<string, unknown>,
                tech: extractTechSet(updated.data as Record<string, unknown> | null),
                sourcePlaybookRunId: sourcePlaybookRunId ?? undefined,
                engagementId: sourceEngagementId,
            });
            void triggerCrossEngagementHit(updated);
            return updated;
        }

        const newRow: NewEntity = {
            kind: input.kind,
            displayName,
            canonicalKey,
            data: input.data ?? {},
        };
        const [created] = await database.insert(entities).values(newRow).returning();
        secuEventBus.publish({
            type: "entity.created",
            entityId: created.id,
            kind: created.kind,
            canonicalKey: created.canonicalKey,
            displayName: created.displayName,
            data: (created.data ?? {}) as Record<string, unknown>,
            tech: extractTechSet(created.data as Record<string, unknown> | null),
            sourcePlaybookRunId: sourcePlaybookRunId ?? undefined,
            engagementId: sourceEngagementId,
        });
        void triggerCrossEngagementHit(created);
        return created;
    },

    async getById(id: number): Promise<Entity | null> {
        const [row] = await database.select().from(entities).where(eq(entities.id, id)).limit(1);
        return row ?? null;
    },

    /**
     * Phase 2.7 — additive shallow-merge in entities.data + last_seen_at touch.
     * Wird vom playbook-runner aufgerufen, wenn ein Worker `WorkerResult.entityDataPatch`
     * liefert (z.B. phone_normalize → e164, email_breach_check → pwnedSources).
     * Publishes entity.updated, damit Rule-Engine reagieren kann.
     *
     * Sprint 1.3 — `sourceContext.playbookRunId` (optional) wird ans Event-Payload
     * weitergereicht, damit der Rule-Evaluator Hop-Tracking machen kann.
     */
    async patchData(
        id: number,
        patch: Record<string, unknown>,
        sourceContext?: { playbookRunId?: number | null; engagementId?: number | null },
    ): Promise<Entity | null> {
        if (!patch || Object.keys(patch).length === 0) return this.getById(id);
        const current = await this.getById(id);
        if (!current) return null;
        const merged = { ...(current.data ?? {}), ...patch };
        const [updated] = await database
            .update(entities)
            .set({ data: merged, lastSeenAt: new Date() })
            .where(eq(entities.id, id))
            .returning();
        secuEventBus.publish({
            type: "entity.updated",
            entityId: updated.id,
            kind: updated.kind,
            canonicalKey: updated.canonicalKey,
            displayName: updated.displayName,
            data: (updated.data ?? {}) as Record<string, unknown>,
            tech: extractTechSet(updated.data as Record<string, unknown> | null),
            sourcePlaybookRunId: sourceContext?.playbookRunId ?? undefined,
            engagementId: sourceContext?.engagementId ?? undefined,
        });
        void triggerCrossEngagementHit(updated);
        return updated;
    },

    async getByCanonical(kind: EntityKind, canonicalKey: string): Promise<Entity | null> {
        const [row] = await database
            .select()
            .from(entities)
            .where(and(eq(entities.kind, kind), eq(entities.canonicalKey, canonicalKey)))
            .limit(1);
        return row ?? null;
    },

    async search(filters: EntitySearchFilters): Promise<EntityWithEngagementCount[]> {
        const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
        const offset = Math.max(filters.offset ?? 0, 0);

        const conditions: SQL[] = [];
        if (filters.kind) {
            const kinds = Array.isArray(filters.kind) ? filters.kind : [filters.kind];
            conditions.push(kinds.length === 1 ? eq(entities.kind, kinds[0]) : inArray(entities.kind, kinds));
        }
        if (filters.q && filters.q.trim()) {
            const pattern = `%${filters.q.trim().toLowerCase()}%`;
            conditions.push(
                sql`(lower(${entities.displayName}) like ${pattern} or lower(${entities.canonicalKey}) like ${pattern})`,
            );
        }
        if (!filters.includeSpeculative) {
            // Sprint 1.2 — Speculative-Entities ausschließen, sofern nicht explizit
            // angefordert. Entities ohne `provenance`-Block (Faktische Discoveries
            // wie DNS-Resolutions) bleiben enthalten — die JSON-Path-Comparison
            // ist NULL-tolerant.
            conditions.push(
                sql`(${entities.data}->'provenance'->>'speculative' IS DISTINCT FROM 'true')`,
            );
        }

        const rows = await database
            .select()
            .from(entities)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(entities.lastSeenAt), asc(entities.id))
            .limit(limit)
            .offset(offset);

        if (rows.length === 0) return [];

        const ids = rows.map((r) => r.id);
        const counts = await database
            .select({
                entityId: engagementEntities.entityId,
                cnt: sql<number>`cast(count(*) as int)`.as("cnt"),
            })
            .from(engagementEntities)
            .where(inArray(engagementEntities.entityId, ids))
            .groupBy(engagementEntities.entityId);
        const countMap = new Map(counts.map((c) => [c.entityId, c.cnt]));

        const tagsByEntity = new Map<number, string[]>();
        const tagRows = await database
            .select({ entityId: entityTags.entityId, tag: entityTags.tag })
            .from(entityTags)
            .where(inArray(entityTags.entityId, ids));
        for (const t of tagRows) {
            const arr = tagsByEntity.get(t.entityId) ?? [];
            arr.push(t.tag);
            tagsByEntity.set(t.entityId, arr);
        }

        return rows.map((r) => ({
            ...r,
            engagementCount: countMap.get(r.id) ?? 0,
            tags: tagsByEntity.get(r.id) ?? [],
        }));
    },

    /** Liefert Entity inkl. Tags und Engagement-Verknüpfungen. */
    async getDetail(id: number): Promise<
        | (Entity & {
              tags: string[];
              engagements: Array<{ engagementId: number; role: string | null; notes: string | null }>;
              relationshipCount: number;
          })
        | null
    > {
        const entity = await this.getById(id);
        if (!entity) return null;

        const [tagRows, engRows, relCountRow] = await Promise.all([
            database.select({ tag: entityTags.tag }).from(entityTags).where(eq(entityTags.entityId, id)),
            database
                .select({
                    engagementId: engagementEntities.engagementId,
                    role: engagementEntities.role,
                    notes: engagementEntities.notes,
                })
                .from(engagementEntities)
                .where(eq(engagementEntities.entityId, id)),
            database
                .select({ cnt: sql<number>`cast(count(*) as int)` })
                .from(entityRelationships)
                .where(
                    sql`${entityRelationships.fromEntityId} = ${id} or ${entityRelationships.toEntityId} = ${id}`,
                ),
        ]);

        return {
            ...entity,
            tags: tagRows.map((r) => r.tag),
            engagements: engRows.map((r) => ({ engagementId: r.engagementId, role: r.role, notes: r.notes })),
            relationshipCount: relCountRow[0]?.cnt ?? 0,
        };
    },

    /**
     * Erweiterte Detail-Sicht für das Workspace-Side-Panel:
     * Findings + Worker-Runs + Authorizations + Related-Entities.
     * Optional auf ein Engagement eingrenzbar (für den per-Engagement-Tab).
     */
    async getDetailExtended(
        id: number,
        opts: {
            engagementId?: number;
            findingsLimit?: number;
            workerRunsLimit?: number;
            relatedLimit?: number;
        } = {},
    ): Promise<
        | (Entity & {
              tags: string[];
              engagements: Array<{ engagementId: number; role: string | null; notes: string | null }>;
              relationshipCount: number;
              engagementsDetailed: Array<{
                  engagementId: number;
                  engagementName: string;
                  engagementStatus: string;
                  role: string | null;
                  notes: string | null;
                  addedAt: string;
              }>;
              findings: {
                  items: Finding[];
                  bySeverity: Record<string, number>;
                  byStatus: Record<string, number>;
                  total: number;
              };
              workerRuns: {
                  items: WorkerRun[];
                  countByStatus: Record<string, number>;
                  lastSuccessfulAt: string | null;
                  total: number;
              };
              authorizations: EntityAuthorization[];
              relatedEntities: Array<{
                  id: number;
                  canonicalKey: string;
                  displayName: string;
                  kind: EntityKind;
                  relationKind: string;
                  relationshipId: number;
              }>;
          })
        | null
    > {
        const base = await this.getDetail(id);
        if (!base) return null;

        const findingsLimit = Math.min(Math.max(opts.findingsLimit ?? 100, 1), 500);
        const workerRunsLimit = Math.min(Math.max(opts.workerRunsLimit ?? 50, 1), 200);
        const relatedLimit = Math.min(Math.max(opts.relatedLimit ?? 100, 1), 500);

        const findingsWhere = opts.engagementId
            ? and(eq(findingsTable.entityId, id), eq(findingsTable.engagementId, opts.engagementId))
            : eq(findingsTable.entityId, id);

        const runsWhere = opts.engagementId
            ? and(eq(workerRunsTable.entityId, id), eq(workerRunsTable.engagementId, opts.engagementId))
            : eq(workerRunsTable.entityId, id);

        const [
            engagementsDetailedRows,
            findingsItems,
            findingsAgg,
            runsItems,
            runsAgg,
            lastSuccessRow,
            authzRows,
            relsRaw,
        ] = await Promise.all([
            database
                .select({
                    engagementId: engagementEntities.engagementId,
                    engagementName: engagements.name,
                    engagementStatus: engagements.status,
                    role: engagementEntities.role,
                    notes: engagementEntities.notes,
                    addedAt: engagementEntities.addedAt,
                })
                .from(engagementEntities)
                .innerJoin(engagements, eq(engagements.id, engagementEntities.engagementId))
                .where(eq(engagementEntities.entityId, id))
                .orderBy(desc(engagementEntities.addedAt)),
            database
                .select()
                .from(findingsTable)
                .where(findingsWhere)
                .orderBy(desc(findingsTable.discoveredAt))
                .limit(findingsLimit),
            database
                .select({
                    severity: findingsTable.severity,
                    status: findingsTable.status,
                    cnt: sql<number>`cast(count(*) as int)`,
                })
                .from(findingsTable)
                .where(findingsWhere)
                .groupBy(findingsTable.severity, findingsTable.status),
            database
                .select()
                .from(workerRunsTable)
                .where(runsWhere)
                .orderBy(desc(workerRunsTable.createdAt))
                .limit(workerRunsLimit),
            database
                .select({
                    status: workerRunsTable.status,
                    cnt: sql<number>`cast(count(*) as int)`,
                })
                .from(workerRunsTable)
                .where(runsWhere)
                .groupBy(workerRunsTable.status),
            database
                .select({ finishedAt: workerRunsTable.finishedAt })
                .from(workerRunsTable)
                .where(and(runsWhere, eq(workerRunsTable.status, "completed")))
                .orderBy(desc(workerRunsTable.finishedAt))
                .limit(1),
            database
                .select()
                .from(entityAuthorizations)
                .where(eq(entityAuthorizations.entityId, id))
                .orderBy(desc(entityAuthorizations.grantedAt)),
            database
                .select()
                .from(entityRelationships)
                .where(
                    sql`${entityRelationships.fromEntityId} = ${id} or ${entityRelationships.toEntityId} = ${id}`,
                )
                .orderBy(desc(entityRelationships.lastObservedAt))
                .limit(relatedLimit),
        ]);

        const otherIds = Array.from(
            new Set(
                relsRaw
                    .map((r) => (r.fromEntityId === id ? r.toEntityId : r.fromEntityId))
                    .filter((x): x is number => x != null),
            ),
        );
        const relEntityRows = otherIds.length
            ? await database.select().from(entities).where(inArray(entities.id, otherIds))
            : [];
        const byEntityId = new Map(relEntityRows.map((e) => [e.id, e]));

        const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        const byStatus: Record<string, number> = {
            open: 0, triaged: 0, confirmed: 0, false_positive: 0, wont_fix: 0, fixed: 0,
        };
        let totalFindings = 0;
        for (const r of findingsAgg) {
            bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + r.cnt;
            byStatus[r.status] = (byStatus[r.status] ?? 0) + r.cnt;
            totalFindings += r.cnt;
        }

        const countByStatus: Record<string, number> = {
            pending: 0, provisioning: 0, running: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0,
        };
        let totalRuns = 0;
        for (const r of runsAgg) {
            countByStatus[r.status] = (countByStatus[r.status] ?? 0) + r.cnt;
            totalRuns += r.cnt;
        }

        const relatedEntities = relsRaw
            .map((r) => {
                const otherId = r.fromEntityId === id ? r.toEntityId : r.fromEntityId;
                const other = byEntityId.get(otherId);
                if (!other) return null;
                return {
                    id: other.id,
                    canonicalKey: other.canonicalKey,
                    displayName: other.displayName,
                    kind: other.kind,
                    relationKind: r.kind,
                    relationshipId: r.id,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x != null);

        return {
            ...base,
            engagementsDetailed: engagementsDetailedRows.map((r) => ({
                engagementId: r.engagementId,
                engagementName: r.engagementName,
                engagementStatus: r.engagementStatus,
                role: r.role,
                notes: r.notes,
                addedAt: r.addedAt.toISOString(),
            })),
            findings: {
                items: findingsItems,
                bySeverity,
                byStatus,
                total: totalFindings,
            },
            workerRuns: {
                items: runsItems,
                countByStatus,
                lastSuccessfulAt: lastSuccessRow[0]?.finishedAt?.toISOString() ?? null,
                total: totalRuns,
            },
            authorizations: authzRows,
            relatedEntities,
        };
    },

    async addTag(entityId: number, tag: string, color?: string | null): Promise<void> {
        const cleaned = tag.trim();
        if (!cleaned) return;
        await database
            .insert(entityTags)
            .values({ entityId, tag: cleaned, color: color ?? null })
            .onConflictDoNothing();
    },

    async removeTag(entityId: number, tag: string): Promise<void> {
        await database
            .delete(entityTags)
            .where(and(eq(entityTags.entityId, entityId), eq(entityTags.tag, tag.trim())));
    },
};

function extractTechSet(data: Record<string, unknown> | null): string[] {
    if (!data) return [];
    const tech = (data as { tech?: unknown }).tech;
    if (!Array.isArray(tech)) return [];
    return tech
        .map((t) => {
            if (typeof t === "string") return t.toLowerCase();
            if (t && typeof t === "object" && "name" in (t as object)) {
                return String((t as { name: unknown }).name).toLowerCase();
            }
            return "";
        })
        .filter((t) => t);
}

/**
 * Phase 2.7 — Cross-Engagement-Hit-Hook.
 *
 * Wird nach jedem upsert/patch fire-and-forget aufgerufen. Wenn die Entity
 * in ≥2 aktiven (nicht archivierten) Engagements existiert, wird ein
 * `entity.cross_engagement_hit`-Event publiziert. Die Rule-Engine matched darauf
 * und triggert standardmäßig `notify_boss`.
 *
 * Bewusst lose gekoppelt: der Hook macht eine eigene JOIN-Query und blockt nie
 * den Hot-Path. Wenn die Engagement-Verlinkung erst nach dem upsert in einem
 * separaten Schritt passiert (z.B. im playbook-runner), greift der Check beim
 * nächsten upsert — Re-Discovery passiert in OSINT sowieso laufend.
 */
export async function triggerCrossEngagementHit(entity: Entity): Promise<void> {
    try {
        const rows = await database
            .select({ engagementId: engagementEntities.engagementId })
            .from(engagementEntities)
            .innerJoin(engagements, eq(engagements.id, engagementEntities.engagementId))
            .where(and(
                eq(engagementEntities.entityId, entity.id),
                sql`${engagements.archivedAt} IS NULL`,
                eq(engagements.status, "active"),
            ));
        const engagementIds = rows.map((r) => r.engagementId);
        if (engagementIds.length < 2) return;
        secuEventBus.publish({
            type: "entity.cross_engagement_hit",
            entityId: entity.id,
            kind: entity.kind,
            canonicalKey: entity.canonicalKey,
            displayName: entity.displayName,
            engagementIds,
        });
    } catch (err) {
        console.warn("[entity.service] cross-engagement-hit check failed", {
            entityId: entity.id,
            err: (err as Error).message,
        });
    }
}

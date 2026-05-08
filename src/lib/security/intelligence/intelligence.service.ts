// Intelligence-Service — globale, engagement-übergreifende Sicht.
//
// Findet Verbindungen, die innerhalb eines einzelnen Engagement-Graphen NICHT
// sichtbar sind: dieselbe Email in zwei Bug-Bounty-Engagements, gleicher
// Tech-Stack über drei Kunden, geteilte Infrastruktur.
//
// Daten kommen aus:
//   - secu_entities                 — globale Identitäten (incl. tech-Layer in `data.tech`)
//   - secu_engagement_entities      — n:m engagement ↔ entity
//   - secu_engagements              — für active-Filter (archivedAt IS NULL)
//   - secu_entity_relationships     — Graph-Kanten

import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { database } from "@/db";
import {
    engagements,
    engagementEntities,
    entities,
    entityRelationships,
    type Engagement,
    type Entity,
    type EntityRelationship,
} from "@/db/individual/individual-schema";

type TechSlot = { techName: string; version?: string | null; source?: string | null; lastSeenAt?: string | null };

function extractTech(data: unknown): TechSlot[] {
    if (!data || typeof data !== "object") return [];
    const tech = (data as { tech?: unknown }).tech;
    if (!Array.isArray(tech)) return [];
    return tech
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .map((t) => ({
            techName: String(t.techName ?? "").toLowerCase(),
            version: t.version != null ? String(t.version) : null,
            source: t.source != null ? String(t.source) : null,
            lastSeenAt: t.lastSeenAt != null ? String(t.lastSeenAt) : null,
        }))
        .filter((t) => t.techName.length > 0);
}

export const intelligenceService = {
    /**
     * Liefert für eine Entity ihr 1-Hop-Neighborhood (alle direkt verbundenen Entities).
     * Gleicher Output wie engagement.graph, aber engagement-übergreifend und mit Limit.
     */
    async neighborhood(
        entityId: number,
        opts: { limit?: number; depth?: number } = {},
    ): Promise<{
        center: Entity | null;
        nodes: Entity[];
        edges: EntityRelationship[];
    }> {
        const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
        const depth = Math.min(Math.max(opts.depth ?? 1, 1), 2);

        const [center] = await database.select().from(entities).where(eq(entities.id, entityId)).limit(1);
        if (!center) return { center: null, nodes: [], edges: [] };

        const visitedIds = new Set<number>([entityId]);
        const collectedNodes: Entity[] = [center];
        const collectedEdges: EntityRelationship[] = [];

        let frontier: number[] = [entityId];
        for (let hop = 0; hop < depth; hop++) {
            if (frontier.length === 0) break;
            const rels = await database
                .select()
                .from(entityRelationships)
                .where(
                    or(
                        inArray(entityRelationships.fromEntityId, frontier),
                        inArray(entityRelationships.toEntityId, frontier),
                    ),
                )
                .orderBy(desc(entityRelationships.lastObservedAt))
                .limit(limit);

            const nextIds = new Set<number>();
            for (const rel of rels) {
                collectedEdges.push(rel);
                for (const id of [rel.fromEntityId, rel.toEntityId]) {
                    if (!visitedIds.has(id)) {
                        nextIds.add(id);
                    }
                }
            }
            if (nextIds.size === 0) break;

            const newRows = await database
                .select()
                .from(entities)
                .where(inArray(entities.id, [...nextIds]));
            for (const row of newRows) {
                if (!visitedIds.has(row.id)) {
                    visitedIds.add(row.id);
                    collectedNodes.push(row);
                }
            }
            frontier = [...nextIds];
        }

        return { center, nodes: collectedNodes, edges: collectedEdges };
    },

    /**
     * Cross-Engagement-Hits: Entities die in 2+ aktiven Engagements vorkommen.
     * Optional auf bestimmte Entity-Kinds beschränkt (z.B. nur Personen + Emails).
     */
    async crossEngagementHits(opts: { kinds?: string[]; limit?: number } = {}): Promise<
        Array<{
            entity: Entity;
            engagementIds: number[];
            engagementCount: number;
        }>
    > {
        const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

        // Subquery: pro Entity die Liste der aktiven Engagement-IDs.
        const groupedRows = await database
            .select({
                entityId: engagementEntities.entityId,
                engagementIds: sql<number[]>`array_agg(distinct ${engagementEntities.engagementId})`,
                cnt: sql<number>`cast(count(distinct ${engagementEntities.engagementId}) as int)`,
            })
            .from(engagementEntities)
            .innerJoin(engagements, eq(engagements.id, engagementEntities.engagementId))
            .where(isNull(engagements.archivedAt))
            .groupBy(engagementEntities.entityId)
            .having(sql`count(distinct ${engagementEntities.engagementId}) > 1`)
            .orderBy(sql`count(distinct ${engagementEntities.engagementId}) desc`)
            .limit(limit);

        if (groupedRows.length === 0) return [];

        const entityRows = await database
            .select()
            .from(entities)
            .where(inArray(entities.id, groupedRows.map((r) => r.entityId)));
        const byId = new Map(entityRows.map((e) => [e.id, e]));

        return groupedRows
            .map((g) => {
                const ent = byId.get(g.entityId);
                if (!ent) return null;
                if (opts.kinds && opts.kinds.length > 0 && !opts.kinds.includes(ent.kind)) return null;
                return {
                    entity: ent,
                    engagementIds: g.engagementIds,
                    engagementCount: g.cnt,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x != null);
    },

    /**
     * Tech-Graph: liefert Tech-Fingerprints die in mehreren Engagements gefunden
     * wurden. Output sind aggregierte Tech-Knoten mit Engagement-Listen — perfekt
     * für eine Cross-Engagement-Tech-Map ("welche unserer Kunden nutzen Wordpress 5.x?").
     */
    async techGraph(opts: { minEngagements?: number; limit?: number } = {}): Promise<
        Array<{
            techName: string;
            engagementIds: number[];
            entityCount: number;
        }>
    > {
        const minEng = Math.max(opts.minEngagements ?? 2, 1);
        const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

        // Wir laden alle aktiven Engagement-Entity-Verlinkungen + die Entity-Daten,
        // dann iterieren wir tech-Slots in JS. Bei wachsenden Datenmengen kann das
        // später durch eine generated_column oder eine eigene secu_tech_index-Tabelle
        // ersetzt werden — für jetzt reicht's bei <100k Entities.
        const rows = await database
            .select({
                entityId: entities.id,
                data: entities.data,
                engagementId: engagementEntities.engagementId,
            })
            .from(entities)
            .innerJoin(engagementEntities, eq(engagementEntities.entityId, entities.id))
            .innerJoin(engagements, eq(engagements.id, engagementEntities.engagementId))
            .where(isNull(engagements.archivedAt));

        const byTech = new Map<string, { engagementIds: Set<number>; entityIds: Set<number> }>();
        for (const row of rows) {
            const tech = extractTech(row.data);
            for (const t of tech) {
                let bucket = byTech.get(t.techName);
                if (!bucket) {
                    bucket = { engagementIds: new Set(), entityIds: new Set() };
                    byTech.set(t.techName, bucket);
                }
                bucket.engagementIds.add(row.engagementId);
                bucket.entityIds.add(row.entityId);
            }
        }

        return Array.from(byTech.entries())
            .map(([techName, b]) => ({
                techName,
                engagementIds: [...b.engagementIds],
                entityCount: b.entityIds.size,
            }))
            .filter((x) => x.engagementIds.length >= minEng)
            .sort((a, b) => b.engagementIds.length - a.engagementIds.length)
            .slice(0, limit);
    },

    /**
     * Welche Entities (engagement-übergreifend) tragen einen konkreten
     * Tech-Fingerprint? Nutzt die in-memory Iteration wie techGraph.
     */
    async techUsages(techName: string, opts: { limit?: number } = {}): Promise<
        Array<{ entity: Entity; engagementIds: number[]; tech: TechSlot[] }>
    > {
        const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
        const target = techName.toLowerCase();

        const rows = await database
            .select({
                entity: entities,
                engagementId: engagementEntities.engagementId,
            })
            .from(entities)
            .innerJoin(engagementEntities, eq(engagementEntities.entityId, entities.id))
            .innerJoin(engagements, eq(engagements.id, engagementEntities.engagementId))
            .where(isNull(engagements.archivedAt));

        const byEntity = new Map<number, { entity: Entity; engagementIds: Set<number>; tech: TechSlot[] }>();
        for (const row of rows) {
            const tech = extractTech(row.entity.data).filter((t) => t.techName === target);
            if (tech.length === 0) continue;
            let bucket = byEntity.get(row.entity.id);
            if (!bucket) {
                bucket = { entity: row.entity, engagementIds: new Set(), tech };
                byEntity.set(row.entity.id, bucket);
            }
            bucket.engagementIds.add(row.engagementId);
        }

        return Array.from(byEntity.values())
            .map((b) => ({ entity: b.entity, engagementIds: [...b.engagementIds], tech: b.tech }))
            .slice(0, limit);
    },
};

void ne; // imported for future filter expansions

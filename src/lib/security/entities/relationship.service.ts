// Relationship-Service — globale Beziehungen zwischen Entities.
//
// Beziehungen sind objektive Fakten ("Person X arbeitet bei Org Y"). Engagement-
// spezifische Annotationen gehören in `engagement_entities`, nicht hier.
// `upsert` deduplikiert über (fromEntityId, toEntityId, kind) und touched
// last_observed_at.

import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { database } from "@/db";
import {
    entities,
    entityRelationships,
    type Entity,
    type EntityRelationship,
    type RelationshipKind,
} from "@/db/individual/individual-schema";

export type UpsertRelationshipInput = {
    fromEntityId: number;
    toEntityId: number;
    kind: RelationshipKind;
    data?: Record<string, unknown>;
    confidence?: number;
    /** "manual" | "recon_<tool>" | "osint_<source>" */
    source?: string;
};

export const relationshipService = {
    async upsert(input: UpsertRelationshipInput): Promise<EntityRelationship> {
        if (input.fromEntityId === input.toEntityId) {
            throw new Error("relationship.upsert: from and to must differ");
        }
        const existing = await database
            .select()
            .from(entityRelationships)
            .where(
                and(
                    eq(entityRelationships.fromEntityId, input.fromEntityId),
                    eq(entityRelationships.toEntityId, input.toEntityId),
                    eq(entityRelationships.kind, input.kind),
                ),
            )
            .limit(1);

        if (existing.length > 0) {
            const cur = existing[0];
            const merged = { ...(cur.data ?? {}), ...(input.data ?? {}) };
            const [updated] = await database
                .update(entityRelationships)
                .set({
                    data: merged,
                    confidence: input.confidence ?? cur.confidence,
                    source: input.source ?? cur.source,
                    lastObservedAt: new Date(),
                })
                .where(eq(entityRelationships.id, cur.id))
                .returning();
            return updated;
        }

        const [created] = await database
            .insert(entityRelationships)
            .values({
                fromEntityId: input.fromEntityId,
                toEntityId: input.toEntityId,
                kind: input.kind,
                data: input.data ?? {},
                confidence: input.confidence ?? 100,
                source: input.source ?? "manual",
            })
            .returning();
        return created;
    },

    async listForEntity(entityId: number): Promise<
        Array<EntityRelationship & { fromEntity?: Entity; toEntity?: Entity }>
    > {
        const rows = await database
            .select()
            .from(entityRelationships)
            .where(
                or(
                    eq(entityRelationships.fromEntityId, entityId),
                    eq(entityRelationships.toEntityId, entityId),
                ),
            )
            .orderBy(desc(entityRelationships.lastObservedAt));

        if (rows.length === 0) return [];
        const ids = Array.from(
            new Set(rows.flatMap((r) => [r.fromEntityId, r.toEntityId])),
        );
        const ents = await database.select().from(entities).where(inArray(entities.id, ids));
        const map = new Map(ents.map((e) => [e.id, e]));
        return rows.map((r) => ({
            ...r,
            fromEntity: map.get(r.fromEntityId),
            toEntity: map.get(r.toEntityId),
        }));
    },

    async delete(id: number): Promise<void> {
        await database.delete(entityRelationships).where(eq(entityRelationships.id, id));
    },

    /** Alle Relationships zwischen einer Menge von Entities — Basis für Graph-Build. */
    async listBetween(entityIds: number[]): Promise<EntityRelationship[]> {
        if (entityIds.length === 0) return [];
        return database
            .select()
            .from(entityRelationships)
            .where(
                and(
                    inArray(entityRelationships.fromEntityId, entityIds),
                    inArray(entityRelationships.toEntityId, entityIds),
                ),
            );
    },
};

// Helper export for callers that want the raw count for an entity.
export async function relationshipCountForEntity(entityId: number): Promise<number> {
    const [row] = await database
        .select({ cnt: sql<number>`cast(count(*) as int)` })
        .from(entityRelationships)
        .where(
            or(
                eq(entityRelationships.fromEntityId, entityId),
                eq(entityRelationships.toEntityId, entityId),
            ),
        );
    return row?.cnt ?? 0;
}

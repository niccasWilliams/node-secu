// Graph-Service — baut den cytoscape-kompatiblen Subgraph eines Engagements.
//
// Knoten = Entities, die im Engagement verlinkt sind.
// Kanten = alle entity_relationships zwischen diesen Entities.

import { eq, inArray } from "drizzle-orm";
import { database } from "@/db";
import {
    engagementEntities,
    entities,
    entityTags,
    type EngagementGraph,
} from "@/db/individual/individual-schema";
import { relationshipService } from "../entities/relationship.service";

export const graphService = {
    async buildForEngagement(engagementId: number): Promise<EngagementGraph> {
        const links = await database
            .select()
            .from(engagementEntities)
            .where(eq(engagementEntities.engagementId, engagementId));

        if (links.length === 0) {
            return { engagementId, nodes: [], edges: [] };
        }

        const entityIds = links.map((l) => l.entityId);
        const [ents, tagRows, rels] = await Promise.all([
            database.select().from(entities).where(inArray(entities.id, entityIds)),
            database
                .select({ entityId: entityTags.entityId, tag: entityTags.tag })
                .from(entityTags)
                .where(inArray(entityTags.entityId, entityIds)),
            relationshipService.listBetween(entityIds),
        ]);

        const tagsByEntity = new Map<number, string[]>();
        for (const t of tagRows) {
            const arr = tagsByEntity.get(t.entityId) ?? [];
            arr.push(t.tag);
            tagsByEntity.set(t.entityId, arr);
        }
        const roleByEntity = new Map(links.map((l) => [l.entityId, l.role]));

        const nodes: EngagementGraph["nodes"] = ents.map((e) => ({
            data: {
                id: `e${e.id}`,
                label: e.displayName,
                kind: e.kind,
                entityId: e.id,
                role: roleByEntity.get(e.id) ?? null,
                tags: tagsByEntity.get(e.id) ?? [],
            },
        }));

        const edges: EngagementGraph["edges"] = rels.map((r) => ({
            data: {
                id: `r${r.id}`,
                source: `e${r.fromEntityId}`,
                target: `e${r.toEntityId}`,
                kind: r.kind,
                confidence: r.confidence,
            },
        }));

        return { engagementId, nodes, edges };
    },
};

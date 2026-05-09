// Graph-Service — baut den cytoscape-kompatiblen Subgraph eines Engagements.
//
// Knoten = Entities, die im Engagement verlinkt sind.
// Kanten = alle entity_relationships zwischen diesen Entities.
//
// Sprint 2 (Backend-Report 2026-05-09 Block 3) — Timestamps + Provenance auf
// Nodes & Edges:
//   - Node.firstSeenAt   = entities.first_seen_at (globaler erster Sight)
//   - Node.lastSeenAt    = entities.last_seen_at  (Tatsachen-Touch)
//   - Node.linkedAt      = engagement_entities.added_at (engagement-spezifisch)
//   - Node.provenance    = entities.data.provenance (speculative + confidence)
//   - Edge.firstObservedAt / lastObservedAt
//   - Edge.relationshipSource  = "manual" | "recon_<tool>" | "osint_<src>"
//   - Edge.discoveredBy  = { kind, refId } via discovered_by_worker_run_id
//                          oder discovered_by_playbook_run_id, fallback "manual".
//
// FE nutzt diese Felder für: Time-Slider (Edge fade-out vor cutoff), Node-
// Severity-Halo, Pivot-Stern bei Cross-Engagement-Identitäten, Tooltip
// „warum existiert dieser Pfad?".

import { eq, inArray } from "drizzle-orm";
import { database } from "@/db";
import {
    engagementEntities,
    entities,
    entityTags,
    type EngagementGraph,
    type EntityProvenance,
} from "@/db/individual/individual-schema";
import { relationshipService } from "../entities/relationship.service";

function extractProvenancePointer(data: Record<string, unknown> | null): { speculative: boolean; confidence: number } | null {
    if (!data) return null;
    const prov = (data as { provenance?: EntityProvenance }).provenance;
    if (!prov || typeof prov !== "object") return null;
    return {
        speculative: Boolean(prov.speculative),
        confidence: typeof prov.confidence === "number" ? prov.confidence : 0,
    };
}

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
        const linkByEntity = new Map(links.map((l) => [l.entityId, l]));

        const nodes: EngagementGraph["nodes"] = ents.map((e) => {
            const link = linkByEntity.get(e.id);
            return {
                data: {
                    id: `e${e.id}`,
                    label: e.displayName,
                    kind: e.kind,
                    entityId: e.id,
                    role: link?.role ?? null,
                    tags: tagsByEntity.get(e.id) ?? [],
                    firstSeenAt: e.firstSeenAt.toISOString(),
                    lastSeenAt: e.lastSeenAt.toISOString(),
                    linkedAt: (link?.addedAt ?? e.firstSeenAt).toISOString(),
                    provenance: extractProvenancePointer(e.data as Record<string, unknown> | null),
                },
            };
        });

        const edges: EngagementGraph["edges"] = rels.map((r) => {
            // discoveredBy-Provenance ableiten:
            //   - explizit über discovered_by_worker_run_id (höchste Priorität)
            //   - sonst discovered_by_playbook_run_id
            //   - sonst aus source-Feld interpretieren ("manual" oder Worker-Suffix)
            let discoveredBy: EngagementGraph["edges"][number]["data"]["discoveredBy"];
            if (r.discoveredByWorkerRunId != null) {
                discoveredBy = { kind: "worker_run", refId: r.discoveredByWorkerRunId };
            } else if (r.discoveredByPlaybookRunId != null) {
                discoveredBy = { kind: "playbook_run", refId: r.discoveredByPlaybookRunId };
            } else if (r.source === "manual" || r.source === "manual_api") {
                discoveredBy = { kind: "manual", refId: null };
            } else if (r.source && r.source.startsWith("signal_chain")) {
                discoveredBy = { kind: "signal_chain", refId: null };
            } else {
                discoveredBy = null;
            }
            return {
                data: {
                    id: `r${r.id}`,
                    source: `e${r.fromEntityId}`,
                    target: `e${r.toEntityId}`,
                    kind: r.kind,
                    confidence: r.confidence,
                    firstObservedAt: r.firstObservedAt.toISOString(),
                    lastObservedAt: r.lastObservedAt.toISOString(),
                    relationshipSource: r.source,
                    discoveredBy,
                },
            };
        });

        return { engagementId, nodes, edges };
    },
};

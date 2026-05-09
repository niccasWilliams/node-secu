// Aggregate-Graph-Service — cross-engagement, dedupe-by-canonical-key.
//
// Liefert einen einzigen Graph über mehrere Engagements hinweg. Entities mit
// gleichem (kind, canonicalKey) werden zu einem Knoten gemerged. Ein Knoten
// trägt die Liste der Engagements, in denen die Entity verlinkt ist, plus
// per-Severity-Findings-Counts für Heat-Map-Coloring im FE.
//
// Designed für `/graph/aggregate` — Intelligence-Dashboard im Operator-FE.

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { database } from "@/db";
import {
    engagements,
    engagementEntities,
    entities,
    entityRelationships,
    findings,
    type Entity,
    type EntityKind,
    type Severity,
} from "@/db/individual/individual-schema";

const NODE_HARD_CAP = 2000;
const EDGE_HARD_CAP = 4000;
const ZERO_BUCKET = (): Record<Severity, number> => ({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
});

export type AggregateGraphOpts = {
    engagementIds?: number[]; // wenn leer: alle nicht-archivierten
    dedupe?: "canonicalKey" | "none";
    kinds?: EntityKind[];
    severities?: Severity[]; // Knoten muss mind. ein Finding dieser Severity tragen
    since?: Date; // nur Entities mit lastSeenAt >= since
    nodeLimit?: number;
};

export type AggregateGraphNode = {
    data: {
        id: string;
        canonicalKey: string;
        kind: EntityKind;
        displayName: string;
        engagementIds: number[];
        entityIds: number[];
        findingsBySeverity: Record<Severity, number>;
        lastSeenAt: string;
        data: Record<string, unknown>;
    };
};

export type AggregateGraphEdge = {
    data: {
        id: string;
        source: string;
        target: string;
        kind: string;
        engagementIds: number[];
    };
};

export type AggregateGraph = {
    nodes: AggregateGraphNode[];
    edges: AggregateGraphEdge[];
    meta: {
        engagementCount: number;
        nodeCount: number;
        edgeCount: number;
        truncated: boolean;
        generatedAt: string;
    };
};

function nodeKey(kind: EntityKind, canonicalKey: string): string {
    // FE bekommt einen stabilen, lesbaren ID — kein Hash-Cipher nötig.
    return `n:${kind}:${canonicalKey}`;
}

export const aggregateGraphService = {
    async build(opts: AggregateGraphOpts = {}): Promise<AggregateGraph> {
        const dedupe = opts.dedupe ?? "canonicalKey";
        const cap = Math.min(Math.max(opts.nodeLimit ?? NODE_HARD_CAP, 1), NODE_HARD_CAP);

        // ── 1) Engagement-Scope bestimmen ──────────────────────────────────
        const engagementWhere = [isNull(engagements.archivedAt)];
        if (opts.engagementIds && opts.engagementIds.length > 0) {
            engagementWhere.push(inArray(engagements.id, opts.engagementIds));
        }
        const engRows = await database
            .select({ id: engagements.id })
            .from(engagements)
            .where(and(...engagementWhere));
        const engIds = engRows.map((r) => r.id);
        if (engIds.length === 0) {
            return {
                nodes: [],
                edges: [],
                meta: {
                    engagementCount: 0,
                    nodeCount: 0,
                    edgeCount: 0,
                    truncated: false,
                    generatedAt: new Date().toISOString(),
                },
            };
        }

        // ── 2) Entities + ihre Engagement-Memberships laden ────────────────
        const linkRows = await database
            .select({
                entityId: engagementEntities.entityId,
                engagementId: engagementEntities.engagementId,
            })
            .from(engagementEntities)
            .where(inArray(engagementEntities.engagementId, engIds));
        if (linkRows.length === 0) {
            return {
                nodes: [],
                edges: [],
                meta: {
                    engagementCount: engIds.length,
                    nodeCount: 0,
                    edgeCount: 0,
                    truncated: false,
                    generatedAt: new Date().toISOString(),
                },
            };
        }

        const allEntityIds = Array.from(new Set(linkRows.map((r) => r.entityId)));
        const entityWhere = [inArray(entities.id, allEntityIds)];
        if (opts.kinds && opts.kinds.length > 0) {
            entityWhere.push(inArray(entities.kind, opts.kinds));
        }
        if (opts.since) {
            entityWhere.push(gte(entities.lastSeenAt, opts.since));
        }
        const entityRows: Entity[] = await database
            .select()
            .from(entities)
            .where(and(...entityWhere));

        if (entityRows.length === 0) {
            return {
                nodes: [],
                edges: [],
                meta: {
                    engagementCount: engIds.length,
                    nodeCount: 0,
                    edgeCount: 0,
                    truncated: false,
                    generatedAt: new Date().toISOString(),
                },
            };
        }

        const keptEntityIds = new Set(entityRows.map((e) => e.id));

        // engagementIds pro Entity
        const engsByEntity = new Map<number, Set<number>>();
        for (const link of linkRows) {
            if (!keptEntityIds.has(link.entityId)) continue;
            let bucket = engsByEntity.get(link.entityId);
            if (!bucket) {
                bucket = new Set();
                engsByEntity.set(link.entityId, bucket);
            }
            bucket.add(link.engagementId);
        }

        // ── 3) Findings-Counts pro Entity & Severity ───────────────────────
        const findingRows = await database
            .select({
                entityId: findings.entityId,
                severity: findings.severity,
                cnt: sql<number>`cast(count(*) as int)`,
            })
            .from(findings)
            .where(
                and(
                    inArray(findings.entityId, [...keptEntityIds]),
                    inArray(findings.engagementId, engIds),
                ),
            )
            .groupBy(findings.entityId, findings.severity);

        const findingsByEntity = new Map<number, Record<Severity, number>>();
        for (const row of findingRows) {
            if (row.entityId == null) continue;
            let bucket = findingsByEntity.get(row.entityId);
            if (!bucket) {
                bucket = ZERO_BUCKET();
                findingsByEntity.set(row.entityId, bucket);
            }
            bucket[row.severity] = row.cnt;
        }

        // ── 4) Knoten bauen (mit Dedup über canonicalKey) ──────────────────
        type NodeBucket = {
            id: string;
            canonicalKey: string;
            kind: EntityKind;
            displayName: string;
            data: Record<string, unknown>;
            lastSeenAt: Date;
            engagementIds: Set<number>;
            entityIds: number[];
            findings: Record<Severity, number>;
        };

        const nodeBuckets = new Map<string, NodeBucket>();
        // Map physical entity-id → graph node-id (for edge mapping)
        const entityIdToNodeId = new Map<number, string>();

        for (const ent of entityRows) {
            const id = dedupe === "canonicalKey" ? nodeKey(ent.kind, ent.canonicalKey) : `e${ent.id}`;
            entityIdToNodeId.set(ent.id, id);

            let bucket = nodeBuckets.get(id);
            if (!bucket) {
                bucket = {
                    id,
                    canonicalKey: ent.canonicalKey,
                    kind: ent.kind,
                    displayName: ent.displayName,
                    data: (ent.data as Record<string, unknown> | null) ?? {},
                    lastSeenAt: ent.lastSeenAt,
                    engagementIds: new Set(),
                    entityIds: [],
                    findings: ZERO_BUCKET(),
                };
                nodeBuckets.set(id, bucket);
            }

            bucket.entityIds.push(ent.id);
            const engs = engsByEntity.get(ent.id);
            if (engs) for (const eId of engs) bucket.engagementIds.add(eId);

            const fnd = findingsByEntity.get(ent.id);
            if (fnd) {
                bucket.findings.critical += fnd.critical;
                bucket.findings.high += fnd.high;
                bucket.findings.medium += fnd.medium;
                bucket.findings.low += fnd.low;
                bucket.findings.info += fnd.info;
            }

            if (ent.lastSeenAt > bucket.lastSeenAt) {
                bucket.lastSeenAt = ent.lastSeenAt;
                bucket.displayName = ent.displayName;
                bucket.data = (ent.data as Record<string, unknown> | null) ?? bucket.data;
            }
        }

        // Severity-Filter: ein Knoten muss mind. ein Finding mit gewünschter Severity haben
        let filteredNodes: NodeBucket[] = [...nodeBuckets.values()];
        if (opts.severities && opts.severities.length > 0) {
            const sevs = opts.severities;
            filteredNodes = filteredNodes.filter((n) =>
                sevs.some((s) => (n.findings[s] ?? 0) > 0),
            );
        }

        // Sortieren: zuerst Knoten mit kritischsten Findings, dann meiste Engagements
        const sevWeight: Record<Severity, number> = {
            critical: 1_000_000,
            high: 10_000,
            medium: 100,
            low: 10,
            info: 1,
        };
        filteredNodes.sort((a, b) => {
            const scoreA =
                a.findings.critical * sevWeight.critical +
                a.findings.high * sevWeight.high +
                a.findings.medium * sevWeight.medium +
                a.findings.low * sevWeight.low +
                a.findings.info * sevWeight.info;
            const scoreB =
                b.findings.critical * sevWeight.critical +
                b.findings.high * sevWeight.high +
                b.findings.medium * sevWeight.medium +
                b.findings.low * sevWeight.low +
                b.findings.info * sevWeight.info;
            if (scoreA !== scoreB) return scoreB - scoreA;
            return b.engagementIds.size - a.engagementIds.size;
        });

        const truncated = filteredNodes.length > cap;
        const keptNodes = truncated ? filteredNodes.slice(0, cap) : filteredNodes;
        const keptNodeIds = new Set(keptNodes.map((n) => n.id));
        const keptPhysicalIds = new Set<number>();
        for (const n of keptNodes) for (const eid of n.entityIds) keptPhysicalIds.add(eid);

        // ── 5) Edges laden — nur zwischen behaltenen Entities ──────────────
        const relRows =
            keptPhysicalIds.size === 0
                ? []
                : await database
                      .select()
                      .from(entityRelationships)
                      .where(
                          and(
                              inArray(entityRelationships.fromEntityId, [...keptPhysicalIds]),
                              inArray(entityRelationships.toEntityId, [...keptPhysicalIds]),
                          ),
                      )
                      .limit(EDGE_HARD_CAP);

        // Edges deduplizieren bei canonical-key-Merge: gleiche (source-node,target-node,kind)
        // werden zu einer Kante; engagementIds werden vereinigt (dafür müssen wir wissen, in
        // welchen Engagements die ZWEI beteiligten Entities zusammen vorkommen — pragmatisch:
        // Schnittmenge der beiden Knoten-Engagement-Listen).
        type EdgeBucket = {
            id: string;
            source: string;
            target: string;
            kind: string;
            engagementIds: Set<number>;
        };
        const edgeBuckets = new Map<string, EdgeBucket>();

        for (const rel of relRows) {
            const sourceId = entityIdToNodeId.get(rel.fromEntityId);
            const targetId = entityIdToNodeId.get(rel.toEntityId);
            if (!sourceId || !targetId) continue;
            if (!keptNodeIds.has(sourceId) || !keptNodeIds.has(targetId)) continue;
            // Self-loops nach Dedup: wenn from + to in dieselbe canonicalKey-Bucket fallen,
            // ist die Kante uninteressant.
            if (sourceId === targetId) continue;

            const key = `${sourceId}|${targetId}|${rel.kind}`;
            let bucket = edgeBuckets.get(key);
            if (!bucket) {
                bucket = {
                    id: key,
                    source: sourceId,
                    target: targetId,
                    kind: rel.kind,
                    engagementIds: new Set(),
                };
                edgeBuckets.set(key, bucket);
            }

            const sourceEngs = nodeBuckets.get(sourceId)?.engagementIds;
            const targetEngs = nodeBuckets.get(targetId)?.engagementIds;
            if (sourceEngs && targetEngs) {
                for (const e of sourceEngs) if (targetEngs.has(e)) bucket.engagementIds.add(e);
            }
        }

        const nodes: AggregateGraphNode[] = keptNodes.map((n) => ({
            data: {
                id: n.id,
                canonicalKey: n.canonicalKey,
                kind: n.kind,
                displayName: n.displayName,
                engagementIds: [...n.engagementIds].sort((a, b) => a - b),
                entityIds: n.entityIds,
                findingsBySeverity: n.findings,
                lastSeenAt: n.lastSeenAt.toISOString(),
                data: n.data,
            },
        }));

        const edges: AggregateGraphEdge[] = [...edgeBuckets.values()].map((e) => ({
            data: {
                id: e.id,
                source: e.source,
                target: e.target,
                kind: e.kind,
                engagementIds: [...e.engagementIds].sort((a, b) => a - b),
            },
        }));

        return {
            nodes,
            edges,
            meta: {
                engagementCount: engIds.length,
                nodeCount: nodes.length,
                edgeCount: edges.length,
                truncated: truncated || edges.length >= EDGE_HARD_CAP,
                generatedAt: new Date().toISOString(),
            },
        };
    },
};

void eq; // future filter expansions

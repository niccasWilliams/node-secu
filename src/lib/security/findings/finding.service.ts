// Finding-Service — engagement-lokale Findings persistieren mit deterministischer
// Dedup. Ein Finding ist eindeutig pro `(engagement_id, fingerprint)` (siehe
// `secu_findings`-Schema). Ein Re-Run derselben Worker-Konfiguration auf
// demselben Target erzeugt also keine Duplikate, sondern wird vom Service
// als "deduped" zurückgemeldet.

import { and, eq, sql } from "drizzle-orm";
import { database } from "@/db";
import {
    engagements,
    entities,
    findings,
    type Finding,
    type FindingStatus,
} from "@/db/individual/individual-schema";
import type { FindingDraft } from "../workers/worker.types";
import { buildFindingFingerprint } from "./fingerprint";
import { secuEventBus } from "../rules/event-bus";

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
        });
    } catch (err) {
        console.error("[finding.service] event publish failed", { findingId: finding.id, err: (err as Error).message });
    }
}

// Worker-Runner — single-target execution path, shared by playbook-runner
// (eine Zeile pro Step×Target) und der Ad-hoc-Worker-API.
//
// Extrahiert aus playbook-runner.ts nach FULL_SCAN.md §1.5: damit sowohl
// orchestrierte (Playbook) als auch operator-getriggerte (POST /workers/...)
// Aufrufe denselben Trust- und Persistenz-Pfad nehmen — inkl. exit_code-
// Persistenz, Trust-Downgrade-Logik und Discovered-Entity-Verlinkung.

import { and, eq } from "drizzle-orm";
import { database } from "@/db";
import {
    engagementEntities,
    entities,
    workerRuns,
    type Engagement,
    type Entity,
} from "@/db/individual/individual-schema";

import { authorizationService } from "../authorization/authorization.service";
import { confidenceService, type NewEvidenceInput } from "../entities/confidence";
import { entityService, triggerCrossEngagementHit } from "../entities/entity.service";
import { relationshipService } from "../entities/relationship.service";
import { engagementBudgetService, isOsintWorker } from "../osint/engagement-budget.service";
import { findingService } from "../findings/finding.service";
import { techFingerprintService } from "../tech/tech-fingerprint.service";
import type {
    DiscoveredEntityDraft,
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    WorkerTarget,
} from "./worker.types";

export interface ExecuteWorkerInput {
    worker: SecurityWorker;
    target: WorkerTarget;
    engagement: Engagement;
    /** Wenn vorhanden: discoveredEntities werden zu diesem rootEntity in Relationship gesetzt. */
    rootEntity: Entity;
    timeoutMs: number;
    /** NULL bei Ad-hoc-Aufrufen ohne Playbook-Kontext. */
    playbookRunId: number | null;
    triggeredByUserId: number | null;
}

export interface ExecuteWorkerOutput {
    workerRunId: number;
    status: "completed" | "failed" | "skipped";
    findingsCreated: number;
    findingsDeduped: number;
    techCount: number;
    newDiscoveredEntities: number;
    discoveredEntityIds: number[];
    durationMs: number;
    error?: string;
    rawOutput?: unknown;
    exitCode?: number | null;
}

/**
 * Führt EINEN Worker gegen EIN Target aus, mit Authorization-Gate,
 * OSINT-Budget-Gate, Persistenz aller Worker-Outputs und Trust-Downgrade.
 *
 * Wirft NICHT — gibt strukturiertes Output zurück. Caller entscheidet, was
 * Failures bedeuten (Run-Level-Failure, partial-success, etc.).
 */
export async function executeWorker(input: ExecuteWorkerInput): Promise<ExecuteWorkerOutput> {
    const { worker, target, engagement, rootEntity, timeoutMs, playbookRunId, triggeredByUserId } = input;

    // 1) Authorization-Gate
    const decision = await authorizationService.canScan(
        { kind: "entity", id: target.id as number },
        worker.requiredScope,
    );

    const [wrun] = await database
        .insert(workerRuns)
        .values({
            playbookRunId: playbookRunId,
            engagementId: engagement.id,
            entityId: target.id as number,
            workerKey: worker.jobKey,
            status: decision.allowed ? "running" : "skipped",
            provider: "local",
            startedAt: new Date(),
        })
        .returning();

    if (!decision.allowed) {
        await database
            .update(workerRuns)
            .set({
                status: "skipped",
                finishedAt: new Date(),
                error: `authorization_denied:${decision.reason}`,
            })
            .where(eq(workerRuns.id, wrun.id));
        return {
            workerRunId: wrun.id,
            status: "skipped",
            findingsCreated: 0,
            findingsDeduped: 0,
            techCount: 0,
            newDiscoveredEntities: 0,
            discoveredEntityIds: [],
            durationMs: 0,
            error: `authorization_denied:${decision.reason}`,
        };
    }

    // 2) OSINT-Budget-Gate
    if (isOsintWorker(worker.jobKey)) {
        const budget = await engagementBudgetService.check(engagement.id);
        if (!budget.allowed) {
            await database
                .update(workerRuns)
                .set({
                    status: "skipped",
                    finishedAt: new Date(),
                    error: budget.reason ?? "engagement_osint_budget_exceeded",
                })
                .where(eq(workerRuns.id, wrun.id));
            return {
                workerRunId: wrun.id,
                status: "skipped",
                findingsCreated: 0,
                findingsDeduped: 0,
                techCount: 0,
                newDiscoveredEntities: 0,
                discoveredEntityIds: [],
                durationMs: 0,
                error: budget.reason ?? "engagement_osint_budget_exceeded",
            };
        }
        engagementBudgetService.increment(engagement.id);
    }

    // 3) Worker-Run mit AbortController + Wall-Timer
    const result = await runWorkerSafely(worker, {
        target,
        workerRunId: wrun.id,
        timeoutMs,
        engagementId: engagement.id,
    });

    // 4) Findings persistieren
    let findingsCreated = 0;
    let findingsDeduped = 0;
    for (const draft of result.findings) {
        try {
            const out = await findingService.persistDraft({
                engagementId: engagement.id,
                entityId: target.id as number,
                workerRunId: wrun.id,
                draft,
            });
            if (out.kind === "created") findingsCreated++;
            else findingsDeduped++;
        } catch (err) {
            console.error("[worker-runner] failed to persist finding", {
                workerRunId: wrun.id, err: (err as Error).message,
            });
        }
    }

    // 5) Tech-Drafts mergen
    const techCount = result.techFingerprints?.length ?? 0;
    if (techCount > 0 && result.techFingerprints) {
        try {
            await techFingerprintService.applyDrafts(target.id as number, result.techFingerprints);
        } catch (err) {
            console.error("[worker-runner] tech apply failed", {
                workerRunId: wrun.id, entityId: target.id, err: (err as Error).message,
            });
        }
    }

    // 6) Discovered Entities — upsert + verlinken + Relationship
    const discoveredEntityIds: number[] = [];
    let newlyLinkedCount = 0;
    if (result.discoveredEntities && result.discoveredEntities.length > 0) {
        const persisted = await persistDiscoveredEntities({
            engagementId: engagement.id,
            rootEntity,
            drafts: result.discoveredEntities,
            addedByUserId: triggeredByUserId,
            workerKey: worker.jobKey,
            workerRunId: wrun.id,
            playbookRunId,
        });
        newlyLinkedCount = persisted.newlyLinkedCount;
        for (const e of persisted.entities) discoveredEntityIds.push(e.id);
    }

    // 7) Source-Entity-Data-Patch
    if (result.entityDataPatch && Object.keys(result.entityDataPatch).length > 0) {
        try {
            await entityService.patchData(
                target.id as number,
                result.entityDataPatch,
                { playbookRunId, engagementId: engagement.id },
            );
        } catch (err) {
            console.error("[worker-runner] entityDataPatch failed", {
                workerRunId: wrun.id, entityId: target.id, err: (err as Error).message,
            });
        }
    }

    // 8) Trust-Gate: ein Worker, der success=true behauptet, aber für ein
    //    CLI-Tool gar keinen exitCode mitliefert (oder einen nicht-Null-Code),
    //    kann nicht als "completed" gewertet werden — siehe FULL_SCAN.md §1.5.1.
    //    exitCode === undefined → Nicht-CLI-Worker, nicht gegated.
    //    exitCode === null oder !== 0 + success=true → Trust-Downgrade.
    const trustDowngrade =
        result.success &&
        result.exitCode !== undefined &&
        (result.exitCode === null || result.exitCode !== 0);
    const effectiveSuccess = result.success && !trustDowngrade;
    const effectiveError = effectiveSuccess
        ? null
        : (result.error ?? (trustDowngrade
            ? `worker_trust_downgrade:exit_code=${result.exitCode}`
            : "worker_failed"));

    await database
        .update(workerRuns)
        .set({
            status: effectiveSuccess ? "completed" : "failed",
            finishedAt: new Date(),
            durationMs: result.durationMs,
            exitCode: result.exitCode ?? null,
            error: effectiveError,
        })
        .where(eq(workerRuns.id, wrun.id));

    return {
        workerRunId: wrun.id,
        status: effectiveSuccess ? "completed" : "failed",
        findingsCreated,
        findingsDeduped,
        techCount,
        newDiscoveredEntities: newlyLinkedCount,
        discoveredEntityIds,
        durationMs: result.durationMs,
        error: effectiveSuccess ? undefined : (effectiveError ?? undefined),
        rawOutput: result.rawOutput,
        exitCode: result.exitCode ?? null,
    };
}

async function runWorkerSafely(worker: SecurityWorker, ctx: WorkerContext): Promise<WorkerResult> {
    try {
        const ac = new AbortController();
        const wallTimer = setTimeout(() => ac.abort(), Math.max(ctx.timeoutMs + 5_000, ctx.timeoutMs));
        try {
            return await worker.run({ ...ctx, abortSignal: ac.signal });
        } finally {
            clearTimeout(wallTimer);
        }
    } catch (err) {
        return {
            success: false,
            findings: [],
            error: (err as Error).message,
            durationMs: 0,
        };
    }
}

const ACCEPTED_ENTITY_KINDS = new Set([
    "asset_domain", "asset_subdomain", "asset_ip", "asset_host", "asset_url",
    "person", "organization", "location", "credential_ref", "document",
    "email_address", "username", "phone_number", "social_account",
]);

async function persistDiscoveredEntities(input: {
    engagementId: number;
    rootEntity: Entity;
    drafts: DiscoveredEntityDraft[];
    addedByUserId: number | null;
    workerKey?: string;
    workerRunId?: number;
    playbookRunId?: number | null;
}): Promise<{ entities: Entity[]; newlyLinkedCount: number }> {
    const persisted: Entity[] = [];
    let newlyLinked = 0;

    for (const draft of input.drafts) {
        if (!ACCEPTED_ENTITY_KINDS.has(draft.kind)) continue;

        const entity = await entityService.upsert({
            kind: draft.kind as Entity["kind"],
            displayName: draft.displayName ?? draft.primaryValue,
            canonical: {
                kind: draft.kind as Entity["kind"],
                primaryValue: draft.primaryValue,
                discriminator: draft.discriminator ?? null,
            },
            data: draft.data,
            sourceContext: { playbookRunId: input.playbookRunId ?? null, engagementId: input.engagementId },
        });
        persisted.push(entity);

        // Sprint 1.2 — Provenance-Aggregation (features.md §2.2 + §2.7).
        // Falls der Worker Evidence-Items oder einen Speculative-Override mitliefert,
        // mergen wir den `provenance`-Block in entity.data via confidenceService.
        const hasEvidence = draft.evidence && draft.evidence.length > 0;
        if (hasEvidence || draft.speculativeOverride !== undefined) {
            try {
                const newEvidence: NewEvidenceInput[] = (draft.evidence ?? []).map((e) => ({
                    source: e.source,
                    workerKey: input.workerKey,
                    workerRunId: input.workerRunId,
                    snippet: e.snippet,
                    confidenceContribution: e.confidenceContribution,
                    evidenceClass: e.evidenceClass,
                    hintRefs: e.hintRefs,
                }));
                const aggregated = confidenceService.buildDataPatch(
                    entity.data as Record<string, unknown> | null,
                    newEvidence,
                    draft.speculativeOverride,
                );
                await entityService.patchData(
                    entity.id,
                    { provenance: aggregated.provenance },
                    { playbookRunId: input.playbookRunId ?? null, engagementId: input.engagementId },
                );
                if (aggregated.newConflictsAdded > 0) {
                    console.warn("[worker-runner] confidence: new conflicts on entity", {
                        entityId: entity.id, count: aggregated.newConflictsAdded,
                    });
                }
            } catch (err) {
                console.error("[worker-runner] confidence aggregation failed", {
                    entityId: entity.id, err: (err as Error).message,
                });
            }
        }

        const [linkExists] = await database
            .select({ id: engagementEntities.id })
            .from(engagementEntities)
            .where(and(eq(engagementEntities.engagementId, input.engagementId), eq(engagementEntities.entityId, entity.id)))
            .limit(1);
        if (!linkExists) {
            await database
                .insert(engagementEntities)
                .values({
                    engagementId: input.engagementId,
                    entityId: entity.id,
                    role: "in_scope",
                    addedBy: input.addedByUserId,
                })
                .onConflictDoNothing();
            newlyLinked += 1;
            void triggerCrossEngagementHit(entity);
        }

        const rel = draft.relationshipToRoot;
        if (rel) {
            const direction = rel.direction ?? "from_discovered_to_root";
            const fromId = direction === "from_discovered_to_root" ? entity.id : input.rootEntity.id;
            const toId = direction === "from_discovered_to_root" ? input.rootEntity.id : entity.id;
            if (fromId !== toId) {
                try {
                    await relationshipService.upsert({
                        fromEntityId: fromId,
                        toEntityId: toId,
                        kind: rel.kind,
                        confidence: rel.confidence ?? 90,
                        source: draft.source ?? "recon_unknown",
                    });
                } catch (err) {
                    console.error("[worker-runner] relationship upsert failed", {
                        fromId, toId, kind: rel.kind, err: (err as Error).message,
                    });
                }
            }
        }
    }
    return { entities: persisted, newlyLinkedCount: newlyLinked };
}

/** Helper, falls Caller die Liste der Entities (nicht nur IDs) braucht. */
export async function loadEntitiesByIds(ids: number[]): Promise<Entity[]> {
    if (ids.length === 0) return [];
    const { inArray } = await import("drizzle-orm");
    return database.select().from(entities).where(inArray(entities.id, ids));
}

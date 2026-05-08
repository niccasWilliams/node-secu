// Playbook-Runner — orchestriert die Ausführung eines Playbooks für ein Engagement.
//
// Lifecycle eines Runs:
//   1. `startRun(...)` schreibt eine `playbook_runs`-Row (status="pending") und
//      kickt asynchron `executeRun(runId)` an. Liefert sofort {runId} an den Caller.
//   2. `executeRun` topologisch-sortiert die Steps, führt sie sequenziell aus.
//      Pro Step: Condition prüfen → Targets ermitteln → Fan-out: pro Target ein
//      worker_run inkl. Authorization-Gate, Worker-Execution, Findings/Tech/
//      Discovered-Entities-Persistierung. Step-Statistiken werden im
//      `playbook_runs.resultSummary` festgehalten.
//   3. Status wechselt: pending → running → completed/failed.
//
// Wichtig: passive_only-Worker sind durch authorizationService.canScan immer
// erlaubt (siehe authorization.service.ts §1). Active-Worker werden in Phase 3
// und 4 ergänzt — die Gate-Logik hier muss nicht angepasst werden.

import { and, desc, eq, inArray } from "drizzle-orm";
import { database } from "@/db";
import {
    engagementEntities,
    engagements,
    entities,
    playbookRuns,
    workerRuns,
    type Engagement,
    type Entity,
    type PlaybookRunStatus,
    type WorkerRun,
} from "@/db/individual/individual-schema";

import { authorizationService } from "../authorization/authorization.service";
import { auditLogService } from "../audit/audit-log.service";
import { entityService } from "../entities/entity.service";
import { relationshipService } from "../entities/relationship.service";
import { findingService } from "../findings/finding.service";
import { techFingerprintService, type PersistedTechFingerprint } from "../tech/tech-fingerprint.service";
import { getWorker } from "../workers/worker-registry";
import type {
    DiscoveredEntityDraft,
    SecurityWorker,
    WorkerContext,
    WorkerResult,
} from "../workers/worker.types";

import { getPlaybook } from "./playbook-registry";
import type {
    Playbook,
    PlaybookContext,
    PlaybookStep,
    PlaybookStepOutput,
    PlaybookTarget,
} from "./playbook.types";

export type StartRunInput = {
    engagementId: number;
    playbookKey: string;
    rootEntityId: number;
    triggeredByUserId?: number | null;
    triggeredBy?: string;
    params?: Record<string, unknown>;
};

export type StartRunResult = {
    runId: number;
    status: PlaybookRunStatus;
    playbook: { key: string; label: string };
};

export type RunStatusReport = {
    run: typeof playbookRuns.$inferSelect;
    workerRuns: WorkerRun[];
    summary: PlaybookRunSummary | null;
};

interface PlaybookRunSummary {
    playbookKey: string;
    rootEntityId: number;
    steps: PlaybookStepOutput[];
    totalFindingsCreated: number;
    totalFindingsDeduped: number;
    totalDiscoveredEntities: number;
}

export const playbookRunner = {
    async startRun(input: StartRunInput): Promise<StartRunResult> {
        const playbook = getPlaybook(input.playbookKey);
        if (!playbook) throw new PlaybookRunnerError(`unknown_playbook:${input.playbookKey}`);

        const [engagement] = await database.select().from(engagements).where(eq(engagements.id, input.engagementId)).limit(1);
        if (!engagement) throw new PlaybookRunnerError("engagement_not_found");
        if (engagement.archivedAt) throw new PlaybookRunnerError("engagement_archived");

        const rootEntity = await entityService.getById(input.rootEntityId);
        if (!rootEntity) throw new PlaybookRunnerError("root_entity_not_found");
        if (!playbook.acceptsRootEntityKinds.includes(rootEntity.kind)) {
            throw new PlaybookRunnerError(
                `root_entity_kind_unsupported:${rootEntity.kind}, expected one of ${playbook.acceptsRootEntityKinds.join(",")}`,
            );
        }

        // Sicherstellen, dass das Root-Entity dem Engagement zugeordnet ist.
        const [link] = await database
            .select({ id: engagementEntities.id })
            .from(engagementEntities)
            .where(and(eq(engagementEntities.engagementId, input.engagementId), eq(engagementEntities.entityId, input.rootEntityId)))
            .limit(1);
        if (!link) throw new PlaybookRunnerError("root_entity_not_linked_to_engagement");

        const [run] = await database
            .insert(playbookRuns)
            .values({
                engagementId: input.engagementId,
                playbookKey: playbook.key,
                status: "pending",
                triggeredBy: input.triggeredBy ?? "manual",
                triggeredByUserId: input.triggeredByUserId ?? null,
                params: { rootEntityId: input.rootEntityId, ...(input.params ?? {}) },
                resultSummary: emptySummary(playbook.key, input.rootEntityId) as unknown as Record<string, unknown>,
            })
            .returning();

        void auditLogService.log({
            action: "playbook_run.start",
            actorUserId: input.triggeredByUserId ?? null,
            engagementId: input.engagementId,
            targetType: "playbook_run",
            targetId: run.id,
            payload: { playbookKey: playbook.key, rootEntityId: input.rootEntityId },
        });

        // Hintergrund-Run kicken — wir warten nicht.
        executeRun(run.id, playbook, engagement, rootEntity, input).catch((err) => {
            console.error("[playbook-runner] unhandled run error", { runId: run.id, err: (err as Error).message });
        });

        return { runId: run.id, status: "pending", playbook: { key: playbook.key, label: playbook.label } };
    },

    async getRunStatus(runId: number): Promise<RunStatusReport | null> {
        const [run] = await database.select().from(playbookRuns).where(eq(playbookRuns.id, runId)).limit(1);
        if (!run) return null;
        const wRuns = await database
            .select()
            .from(workerRuns)
            .where(eq(workerRuns.playbookRunId, runId))
            .orderBy(workerRuns.id);
        return {
            run,
            workerRuns: wRuns,
            summary: (run.resultSummary as unknown as PlaybookRunSummary | null) ?? null,
        };
    },

    async listRunsForEngagement(engagementId: number): Promise<typeof playbookRuns.$inferSelect[]> {
        return database
            .select()
            .from(playbookRuns)
            .where(eq(playbookRuns.engagementId, engagementId))
            .orderBy(desc(playbookRuns.createdAt));
    },
};

// ─── Internals ──────────────────────────────────────────────────────────────

async function executeRun(
    runId: number,
    playbook: Playbook,
    engagement: Engagement,
    rootEntity: Entity,
    input: StartRunInput,
): Promise<void> {
    await database
        .update(playbookRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(playbookRuns.id, runId));

    const summary: PlaybookRunSummary = emptySummary(playbook.key, rootEntity.id);
    const stepOutputs: Record<string, PlaybookStepOutput> = {};
    const discoveredEntityIds = new Set<number>([rootEntity.id]);
    const techByEntityId: Record<number, Set<string>> = {
        [rootEntity.id]: await techFingerprintService.getTechSet(rootEntity.id),
    };
    const techDetailsByEntityId: Record<number, PersistedTechFingerprint[]> = {
        [rootEntity.id]: await techFingerprintService.list(rootEntity.id),
    };

    const ordered = topoSort(playbook.steps);

    let runFailed = false;

    for (const step of ordered) {
        const ctx: PlaybookContext = {
            engagementId: engagement.id,
            rootEntity,
            stepOutputs,
            discoveredEntities: await loadEntitiesByIds([...discoveredEntityIds]),
            techByEntityId,
            techDetailsByEntityId,
        };

        // Condition zuerst — wenn `false`, gar keine Targets ermitteln.
        if (step.when) {
            try {
                const allowed = await step.when(ctx);
                if (!allowed) {
                    const skipOutput: PlaybookStepOutput = {
                        stepKey: step.key,
                        workerKey: step.workerKey,
                        runs: [],
                    };
                    stepOutputs[step.key] = skipOutput;
                    summary.steps.push({
                        ...skipOutput,
                        runs: [{
                            targetEntityId: 0,
                            targetValue: "",
                            status: "skipped",
                            findingsCreated: 0,
                            techDiscovered: 0,
                            discoveredEntities: 0,
                            error: step.skipReason ?? "condition_false",
                        }],
                    });
                    await persistRunSummary(runId, summary);
                    continue;
                }
            } catch (err) {
                const skipOutput: PlaybookStepOutput = {
                    stepKey: step.key,
                    workerKey: step.workerKey,
                    runs: [{
                        targetEntityId: 0,
                        targetValue: "",
                        status: "failed",
                        findingsCreated: 0,
                        techDiscovered: 0,
                        discoveredEntities: 0,
                        error: `condition_eval_failed: ${(err as Error).message}`,
                    }],
                };
                stepOutputs[step.key] = skipOutput;
                summary.steps.push(skipOutput);
                await persistRunSummary(runId, summary);
                continue;
            }
        }

        const worker = getWorker(step.workerKey);
        if (!worker) {
            const noWorkerOutput: PlaybookStepOutput = {
                stepKey: step.key,
                workerKey: step.workerKey,
                runs: [{
                    targetEntityId: 0,
                    targetValue: "",
                    status: "failed",
                    findingsCreated: 0,
                    techDiscovered: 0,
                    discoveredEntities: 0,
                    error: `worker_not_registered:${step.workerKey}`,
                }],
            };
            stepOutputs[step.key] = noWorkerOutput;
            summary.steps.push(noWorkerOutput);
            runFailed = true;
            await persistRunSummary(runId, summary);
            continue;
        }

        let targets: PlaybookTarget[] = [];
        try {
            targets = await step.targets(ctx);
        } catch (err) {
            const targetErrOutput: PlaybookStepOutput = {
                stepKey: step.key,
                workerKey: step.workerKey,
                runs: [{
                    targetEntityId: 0,
                    targetValue: "",
                    status: "failed",
                    findingsCreated: 0,
                    techDiscovered: 0,
                    discoveredEntities: 0,
                    error: `target_resolution_failed: ${(err as Error).message}`,
                }],
            };
            stepOutputs[step.key] = targetErrOutput;
            summary.steps.push(targetErrOutput);
            runFailed = true;
            await persistRunSummary(runId, summary);
            continue;
        }

        if (targets.length === 0) {
            const noTargetOutput: PlaybookStepOutput = {
                stepKey: step.key,
                workerKey: step.workerKey,
                runs: [{
                    targetEntityId: 0,
                    targetValue: "",
                    status: "skipped",
                    findingsCreated: 0,
                    techDiscovered: 0,
                    discoveredEntities: 0,
                    error: "no_targets",
                }],
            };
            stepOutputs[step.key] = noTargetOutput;
            summary.steps.push(noTargetOutput);
            await persistRunSummary(runId, summary);
            continue;
        }

        const stepOutput: PlaybookStepOutput = {
            stepKey: step.key,
            workerKey: step.workerKey,
            runs: [],
        };

        for (const target of targets) {
            // Authorization-Gate: passive_only ist immer ok, active wäre hier zu blocken.
            const decision = await authorizationService.canScan(
                { kind: "entity", id: target.id },
                worker.requiredScope,
            );

            const [wrun] = await database
                .insert(workerRuns)
                .values({
                    playbookRunId: runId,
                    engagementId: engagement.id,
                    entityId: target.id,
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
                stepOutput.runs.push({
                    targetEntityId: target.id,
                    targetValue: target.value,
                    status: "skipped",
                    findingsCreated: 0,
                    techDiscovered: 0,
                    discoveredEntities: 0,
                    error: `authorization_denied:${decision.reason}`,
                });
                continue;
            }

            const result = await runWorkerSafely(worker, {
                target,
                workerRunId: wrun.id,
                timeoutMs: step.timeoutMs ?? worker.defaultTimeoutMs,
            });

            // Findings persistieren.
            let findingsCreated = 0;
            let findingsDeduped = 0;
            for (const draft of result.findings) {
                try {
                    const out = await findingService.persistDraft({
                        engagementId: engagement.id,
                        entityId: target.id,
                        workerRunId: wrun.id,
                        draft,
                    });
                    if (out.kind === "created") findingsCreated++;
                    else findingsDeduped++;
                } catch (err) {
                    console.error("[playbook-runner] failed to persist finding", {
                        runId, workerRunId: wrun.id, err: (err as Error).message,
                    });
                }
            }

            // Tech-Drafts merge.
            const techCount = result.techFingerprints?.length ?? 0;
            if (techCount > 0 && result.techFingerprints) {
                try {
                    await techFingerprintService.applyDrafts(target.id, result.techFingerprints);
                    techByEntityId[target.id] = await techFingerprintService.getTechSet(target.id);
                    techDetailsByEntityId[target.id] = await techFingerprintService.list(target.id);
                } catch (err) {
                    console.error("[playbook-runner] tech apply failed", {
                        runId, entityId: target.id, err: (err as Error).message,
                    });
                }
            }

            // Discovered Entities — upsert + verlinken + Relationship anlegen.
            let newEntitiesCount = 0;
            if (result.discoveredEntities && result.discoveredEntities.length > 0) {
                const persisted = await persistDiscoveredEntities({
                    engagementId: engagement.id,
                    rootEntity,
                    drafts: result.discoveredEntities,
                    addedByUserId: input.triggeredByUserId ?? null,
                });
                newEntitiesCount = persisted.newlyLinkedCount;
                for (const e of persisted.entities) {
                    if (!discoveredEntityIds.has(e.id)) {
                        discoveredEntityIds.add(e.id);
                        techByEntityId[e.id] = await techFingerprintService.getTechSet(e.id);
                        techDetailsByEntityId[e.id] = await techFingerprintService.list(e.id);
                    }
                }
            }

            await database
                .update(workerRuns)
                .set({
                    status: result.success ? "completed" : "failed",
                    finishedAt: new Date(),
                    durationMs: result.durationMs,
                    error: result.success ? null : (result.error ?? "worker_failed"),
                })
                .where(eq(workerRuns.id, wrun.id));

            stepOutput.runs.push({
                targetEntityId: target.id,
                targetValue: target.value,
                status: result.success ? "completed" : "failed",
                findingsCreated,
                techDiscovered: techCount,
                discoveredEntities: newEntitiesCount,
                error: result.success ? undefined : result.error,
            });

            summary.totalFindingsCreated += findingsCreated;
            summary.totalFindingsDeduped += findingsDeduped;
            summary.totalDiscoveredEntities += newEntitiesCount;

            if (!result.success) runFailed = true;
        }

        stepOutputs[step.key] = stepOutput;
        summary.steps.push(stepOutput);
        await persistRunSummary(runId, summary);
    }

    await database
        .update(playbookRuns)
        .set({
            status: runFailed ? "failed" : "completed",
            finishedAt: new Date(),
            resultSummary: summary as unknown as Record<string, unknown>,
        })
        .where(eq(playbookRuns.id, runId));

    void auditLogService.log({
        action: "playbook_run.finish",
        actorUserId: input.triggeredByUserId ?? null,
        engagementId: engagement.id,
        targetType: "playbook_run",
        targetId: runId,
        payload: {
            playbookKey: playbook.key,
            findingsCreated: summary.totalFindingsCreated,
            findingsDeduped: summary.totalFindingsDeduped,
            discoveredEntities: summary.totalDiscoveredEntities,
            failed: runFailed,
        },
        success: !runFailed,
    });
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

async function persistDiscoveredEntities(input: {
    engagementId: number;
    rootEntity: Entity;
    drafts: DiscoveredEntityDraft[];
    addedByUserId: number | null;
}): Promise<{ entities: Entity[]; newlyLinkedCount: number }> {
    const persisted: Entity[] = [];
    let newlyLinked = 0;

    for (const draft of input.drafts) {
        if (!isAcceptedKind(draft.kind)) continue;

        const entity = await entityService.upsert({
            kind: draft.kind as Entity["kind"],
            displayName: draft.displayName ?? draft.primaryValue,
            canonical: {
                kind: draft.kind as Entity["kind"],
                primaryValue: draft.primaryValue,
                discriminator: draft.discriminator ?? null,
            },
            data: draft.data,
        });
        persisted.push(entity);

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
                    console.error("[playbook-runner] relationship upsert failed", {
                        fromId, toId, kind: rel.kind, err: (err as Error).message,
                    });
                }
            }
        }
    }
    return { entities: persisted, newlyLinkedCount: newlyLinked };
}

async function loadEntitiesByIds(ids: number[]): Promise<Entity[]> {
    if (ids.length === 0) return [];
    return database.select().from(entities).where(inArray(entities.id, ids));
}

const ACCEPTED_ENTITY_KINDS = new Set([
    "asset_domain", "asset_subdomain", "asset_ip", "asset_host", "asset_url",
    "person", "organization", "location", "credential_ref", "document",
]);
function isAcceptedKind(kind: string): boolean {
    return ACCEPTED_ENTITY_KINDS.has(kind);
}

function topoSort(steps: PlaybookStep[]): PlaybookStep[] {
    const byKey = new Map(steps.map((s) => [s.key, s]));
    const visited = new Set<string>();
    const ordered: PlaybookStep[] = [];

    function visit(key: string, stack: string[]): void {
        if (visited.has(key)) return;
        if (stack.includes(key)) {
            throw new PlaybookRunnerError(`playbook_cycle: ${stack.join(" → ")} → ${key}`);
        }
        const step = byKey.get(key);
        if (!step) throw new PlaybookRunnerError(`unknown_step:${key}`);
        for (const dep of step.dependsOn ?? []) visit(dep, [...stack, key]);
        visited.add(key);
        ordered.push(step);
    }
    for (const s of steps) visit(s.key, []);
    return ordered;
}

function emptySummary(playbookKey: string, rootEntityId: number): PlaybookRunSummary {
    return {
        playbookKey,
        rootEntityId,
        steps: [],
        totalFindingsCreated: 0,
        totalFindingsDeduped: 0,
        totalDiscoveredEntities: 0,
    };
}

async function persistRunSummary(runId: number, summary: PlaybookRunSummary): Promise<void> {
    await database
        .update(playbookRuns)
        .set({ resultSummary: summary as unknown as Record<string, unknown> })
        .where(eq(playbookRuns.id, runId));
}

export class PlaybookRunnerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PlaybookRunnerError";
    }
}

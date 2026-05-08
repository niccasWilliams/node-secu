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

import { auditLogService } from "../audit/audit-log.service";
import { entityService } from "../entities/entity.service";
import { secuEventBus } from "../rules/event-bus";
import { techFingerprintService, type PersistedTechFingerprint } from "../tech/tech-fingerprint.service";
import { executeWorker } from "../workers/worker-runner";
import { getWorker } from "../workers/worker-registry";

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
    /**
     * Sprint 1.3 (features.md §2.4) — Parent-Run für Auto-Chain-Hop-Tracking.
     * Manuelle Runs lassen das undefined → hopDepth=0. Rule-getriggerte Runs
     * setzen es auf den auslösenden Run; der Runner enforced danach das
     * Hop-Limit aus engagements.osintMaxHops und blockt ggf. mit Audit-Log.
     */
    parentRunId?: number | null;
};

export type StartRunResult = {
    runId: number;
    status: PlaybookRunStatus;
    playbook: { key: string; label: string };
};

/** Sprint 1.3 — Outcome wenn ein Run wegen Hop-Budget nicht startet. */
export interface BudgetBlockedResult {
    blocked: true;
    reason: "hop_budget_exceeded";
    hopDepthRequested: number;
    hopDepthLimit: number;
    parentRunId: number;
}

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
    totalWorkerRuns?: number;
    successfulWorkerRuns?: number;
}

export const playbookRunner = {
    async startRun(input: StartRunInput): Promise<StartRunResult | BudgetBlockedResult> {
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

        // Sprint 1.3 — Hop-Budget-Enforcement (features.md §2.4).
        // Hop-Depth = parent.hopDepth + 1 für Rule-getriggerte Runs, 0 für manuelle.
        // engagements.osintMaxHops ist der Hard-Cap (default 2). Bei Überschreitung
        // wird der Run NICHT angelegt, sondern als blocked-Audit-Eintrag persistiert.
        let hopDepth = 0;
        let parentRunId: number | null = null;
        if (input.parentRunId != null) {
            const [parent] = await database
                .select({ hopDepth: playbookRuns.hopDepth })
                .from(playbookRuns)
                .where(eq(playbookRuns.id, input.parentRunId))
                .limit(1);
            if (!parent) {
                // Parent existiert nicht — wir treaten es als manuell, loggen aber
                // den Inkonsistenz-Hint im Audit (kann passieren wenn Parent gerade
                // gelöscht/cancelled wurde).
                console.warn("[playbook-runner] parent_run not found", { parentRunId: input.parentRunId });
            } else {
                parentRunId = input.parentRunId;
                hopDepth = parent.hopDepth + 1;
                if (hopDepth > engagement.osintMaxHops) {
                    void auditLogService.log({
                        action: "playbook_run.hop_budget_blocked",
                        actorUserId: input.triggeredByUserId ?? null,
                        engagementId: input.engagementId,
                        targetType: "playbook",
                        payload: {
                            playbookKey: playbook.key,
                            rootEntityId: input.rootEntityId,
                            parentRunId,
                            hopDepthRequested: hopDepth,
                            hopDepthLimit: engagement.osintMaxHops,
                            triggeredBy: input.triggeredBy ?? "manual",
                        },
                        success: false,
                        errorMessage: `hop_budget_exceeded:requested=${hopDepth},limit=${engagement.osintMaxHops}`,
                    });
                    return {
                        blocked: true,
                        reason: "hop_budget_exceeded",
                        hopDepthRequested: hopDepth,
                        hopDepthLimit: engagement.osintMaxHops,
                        parentRunId,
                    };
                }
            }
        }

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
                hopDepth,
                parentRunId,
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

    // Run-Status-Semantik: "failed" nur wenn entweder ein Runner-Level-Fehler
    // (Condition/Target-Resolution/Worker-not-registered) auftrat ODER alle
    // ausgeführten Worker fehlgeschlagen sind. Einzelne Worker-Failures
    // (z.B. tote Subdomains, die DNS-unresolvable sind) markieren den Run
    // sonst nicht als failed — der Customer-Report zeigt sie via `result_summary`.
    let runnerFatalError = false;
    let successfulWorkerRuns = 0;
    let totalWorkerRuns = 0;

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
            runnerFatalError = true;
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
            runnerFatalError = true;
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
            const out = await executeWorker({
                worker,
                target,
                engagement,
                rootEntity,
                timeoutMs: step.timeoutMs ?? worker.defaultTimeoutMs,
                playbookRunId: runId,
                triggeredByUserId: input.triggeredByUserId ?? null,
            });

            // Tech-Caches aufrechterhalten — die hängen am Step-Loop, nicht am
            // Worker-Executor (downstream-Steps lesen techByEntityId via ctx).
            if (out.techCount > 0) {
                techByEntityId[target.id] = await techFingerprintService.getTechSet(target.id);
                techDetailsByEntityId[target.id] = await techFingerprintService.list(target.id);
            }
            for (const eid of out.discoveredEntityIds) {
                if (!discoveredEntityIds.has(eid)) {
                    discoveredEntityIds.add(eid);
                    techByEntityId[eid] = await techFingerprintService.getTechSet(eid);
                    techDetailsByEntityId[eid] = await techFingerprintService.list(eid);
                }
            }

            stepOutput.runs.push({
                targetEntityId: target.id,
                targetValue: target.value,
                status: out.status,
                findingsCreated: out.findingsCreated,
                techDiscovered: out.techCount,
                discoveredEntities: out.newDiscoveredEntities,
                error: out.error,
            });

            summary.totalFindingsCreated += out.findingsCreated;
            summary.totalFindingsDeduped += out.findingsDeduped;
            summary.totalDiscoveredEntities += out.newDiscoveredEntities;

            // Skipped-Runs zählen wir nicht als ausgeführt — sonst würde ein
            // budget-blockierter Run als Failure missverstanden.
            if (out.status !== "skipped") {
                totalWorkerRuns += 1;
                if (out.status === "completed") successfulWorkerRuns += 1;
            }
        }

        stepOutputs[step.key] = stepOutput;
        summary.steps.push(stepOutput);
        await persistRunSummary(runId, summary);
    }

    summary.totalWorkerRuns = totalWorkerRuns;
    summary.successfulWorkerRuns = successfulWorkerRuns;

    const allWorkersFailed = totalWorkerRuns > 0 && successfulWorkerRuns === 0;
    const runFailed = runnerFatalError || allWorkersFailed;
    const finalStatus: PlaybookRunStatus = runFailed ? "failed" : "completed";

    await database
        .update(playbookRuns)
        .set({
            status: finalStatus,
            finishedAt: new Date(),
            resultSummary: summary as unknown as Record<string, unknown>,
        })
        .where(eq(playbookRuns.id, runId));

    secuEventBus.publish({
        type: "playbook_run.completed",
        runId,
        engagementId: engagement.id,
        engagementKind: engagement.kind,
        playbookKey: playbook.key,
        status: finalStatus,
        rootEntityId: rootEntity.id,
        findingsCreated: summary.totalFindingsCreated,
        discoveredEntities: summary.totalDiscoveredEntities,
    });

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

async function loadEntitiesByIds(ids: number[]): Promise<Entity[]> {
    if (ids.length === 0) return [];
    return database.select().from(entities).where(inArray(entities.id, ids));
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

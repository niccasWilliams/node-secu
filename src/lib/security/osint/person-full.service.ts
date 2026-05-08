// Phase 2.7 — Person/Email-Full-Enrichment-Orchestrator.
//
// Sammelt alle verlinkten Identitäten (Email/Username/Phone) einer Wurzel-Entity
// und triggert deren passive OSINT-Playbooks parallel. Der initiale Eintrag in
// `secu_signal_chain_log` wird sofort geschrieben; ein event-bus-Listener auf
// `playbook_run.completed` aktualisiert die Chain-Spur asynchron.
//
// Akzeptierte Wurzel-Kinds:
//   - person          → triggert für jede verknüpfte email_address/username/phone_number
//   - email_address   → osint_email_passive direkt
//   - username        → osint_username_passive direkt
//   - asset_domain    → osint_organization_recon

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { database } from "@/db";
import {
    entities,
    entityRelationships,
    secuSignalChainLog,
    type Entity,
} from "@/db/individual/individual-schema";
import { entityService } from "../entities/entity.service";
import { playbookRunner } from "../playbooks/playbook-runner";
import { secuEventBus } from "../rules/event-bus";

interface PersonFullRunInput {
    engagementId: number;
    rootEntityId: number;
    triggeredByUserId?: number | null;
}

interface PersonFullRunResult {
    signalChainLogId: number;
    rootEntityId: number;
    subPlaybookRuns: Array<{ runId: number; playbookKey: string; rootEntityId: number; rootKind: string }>;
}

const PLAYBOOK_FOR_KIND: Record<string, string> = {
    email_address: "osint_email_passive",
    username: "osint_username_passive",
    asset_domain: "osint_organization_recon",
    asset_subdomain: "osint_organization_recon",
};

let listenerRegistered = false;

export const osintPersonFullService = {
    async run(input: PersonFullRunInput): Promise<PersonFullRunResult> {
        ensureListener();

        const root = await entityService.getById(input.rootEntityId);
        if (!root) throw new Error("person_full_root_entity_not_found");

        const targets = await collectTargets(root);

        const subRuns: PersonFullRunResult["subPlaybookRuns"] = [];
        for (const t of targets) {
            const playbookKey = PLAYBOOK_FOR_KIND[t.kind];
            if (!playbookKey) continue;
            try {
                const r = await playbookRunner.startRun({
                    engagementId: input.engagementId,
                    playbookKey,
                    rootEntityId: t.id,
                    triggeredByUserId: input.triggeredByUserId ?? null,
                    triggeredBy: "osint_person_full",
                });
                if ("blocked" in r) {
                    // person_full setzt aktuell keinen parentRunId, daher
                    // tritt blocked nicht auf. Defensive Handling.
                    console.warn(`[osint_person_full] sub-playbook ${playbookKey} blocked: ${r.reason}`);
                    continue;
                }
                subRuns.push({ runId: r.runId, playbookKey, rootEntityId: t.id, rootKind: t.kind });
            } catch (err) {
                console.warn(`[osint_person_full] sub-playbook ${playbookKey} for entity ${t.id} failed to start: ${(err as Error).message}`);
            }
        }

        const initialChain = subRuns.map((sr) => ({
            step: `${sr.playbookKey}@${sr.rootEntityId}`,
            playbookRunId: sr.runId,
            rootEntityId: sr.rootEntityId,
            rootKind: sr.rootKind,
            status: "running" as const,
        }));

        const [logRow] = await database
            .insert(secuSignalChainLog)
            .values({
                engagementId: input.engagementId,
                rootEntityId: root.id,
                triggeredBy: "osint_person_full",
                signalChain: initialChain as Array<Record<string, unknown>>,
            })
            .returning();

        return {
            signalChainLogId: logRow.id,
            rootEntityId: root.id,
            subPlaybookRuns: subRuns,
        };
    },
};

async function collectTargets(root: Entity): Promise<Array<{ id: number; kind: string; canonicalKey: string }>> {
    if (root.kind !== "person") {
        return [{ id: root.id, kind: root.kind, canonicalKey: root.canonicalKey }];
    }

    // Person: alle direkt verlinkten Identitäts-Entities einsammeln.
    const rels = await database
        .select({
            from: entityRelationships.fromEntityId,
            to: entityRelationships.toEntityId,
        })
        .from(entityRelationships)
        .where(or(
            eq(entityRelationships.fromEntityId, root.id),
            eq(entityRelationships.toEntityId, root.id),
        ));

    const otherIds = new Set<number>();
    for (const r of rels) {
        if (r.from !== root.id) otherIds.add(r.from);
        if (r.to !== root.id) otherIds.add(r.to);
    }

    if (otherIds.size === 0) return [];

    const linked = await database
        .select({ id: entities.id, kind: entities.kind, canonicalKey: entities.canonicalKey })
        .from(entities)
        .where(and(
            inArray(entities.id, [...otherIds]),
            inArray(entities.kind, ["email_address", "username", "asset_domain", "asset_subdomain"]),
        ));

    return linked;
}

/**
 * Registriert (idempotent) einen Listener auf playbook_run.completed,
 * der die signalChain-Spur aller parents aktualisiert. Ein Sub-Playbook gehört
 * zu einem Chain-Log, wenn der `runId` in dessen `signalChain[].playbookRunId`
 * vorkommt.
 */
function ensureListener(): void {
    if (listenerRegistered) return;
    listenerRegistered = true;
    secuEventBus.on("playbook_run.completed", async (event) => {
        try {
            // Pragmatisch: lade alle offenen chain-logs (typischerweise wenige aktiv
            // gleichzeitig), filter in JS. JSONB-Path-Query wäre eleganter, ist aber
            // Driver-spezifisch — Phase 2.7-Skala vertretbar.
            const open = await database
                .select()
                .from(secuSignalChainLog)
                .where(isNull(secuSignalChainLog.finishedAt));

            for (const row of open) {
                const chain = (row.signalChain ?? []) as Array<Record<string, unknown>>;
                if (!chain.some((s) => s.playbookRunId === event.runId)) continue;

                const updated = chain.map((step) => {
                    if (step.playbookRunId === event.runId) {
                        return {
                            ...step,
                            status: event.status,
                            findingsCreated: event.findingsCreated,
                            discoveredEntities: event.discoveredEntities,
                            finishedAt: new Date().toISOString(),
                        };
                    }
                    return step;
                });
                const allDone = updated.every((s) => s.status === "completed" || s.status === "failed");
                await database
                    .update(secuSignalChainLog)
                    .set({
                        signalChain: updated as Array<Record<string, unknown>>,
                        finishedAt: allDone ? new Date() : null,
                    })
                    .where(eq(secuSignalChainLog.id, row.id));
            }
        } catch (err) {
            console.warn(`[osint_person_full] chain-log update failed: ${(err as Error).message}`);
        }
    });
}

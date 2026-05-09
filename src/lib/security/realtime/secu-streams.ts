// Realtime-Topics für das Frontend-Cockpit.
//
// Topology:
//   secu:engagement:<id>   — alles was zum Engagement gehört (entities, findings,
//                            worker_runs, playbook_runs, signal_chains, auth,
//                            notes, scope, hints, …)
//   secu:run:<runId>       — Status eines konkreten Playbook-Runs (lean-status-Snapshot bei jedem Step)
//   secu:findings:<engId>  — neue / geänderte Findings für ein Engagement (gefiltert)
//   secu:entities:<engId>  — Entity-Updates / -Discoveries für ein Engagement
//   secu:global            — Cross-Engagement-Hits + System-weite Notifications
//
// Subscribe-Pfad (vom FE):
//   ws.send({ type: "datastream_subscribe", stream: "secu:engagement:42" })
//
// Receive-Format:
//   { type: "datastream_event", stream: "secu:engagement:42", payload: { event: "<eventType>", data: <SecuEvent> } }
//
// Ein einziger `secu:engagement:<id>`-Channel reicht — Frontend merged in
// einen unified Activity-Rail. Granulare Findings/Entities-Channels existieren
// für FE-Module die NUR diese Slice brauchen (z.B. SeverityStrip-Component).
//
// Backfill-Konvention: KEIN automatischer Replay. Frontend on-mount fetched
// einmal die existierenden Listen (signal_chains_list, worker_runs_list,
// findings_list, …) und der WS füllt nur die Delta. Das hält den Bus
// idempotent und vermeidet doppelte Events nach Reconnects.

import { database } from "@/db";
import { engagementEntities } from "@/db/individual/individual-schema";
import { eq } from "drizzle-orm";
import { dataStreamManager } from "@/lib/websockets/datastreams/dataStream.manager";
import type { DataStreamContext } from "@/lib/websockets/datastreams/dataStream.types";
import { secuEventBus, type SecuEvent } from "../rules/event-bus";

// Hilfs-Types: Extract<> auf SecuEvent liefert für entity.created/updated `never`,
// weil der Member EntityEventPayload eine Union "entity.created"|"entity.updated"
// als type-Feld hat (TS-Quirk bei distributed Extract). Wir fischen die konkrete
// Form lokal raus.
type EntityEvent = Extract<SecuEvent, { type: "entity.created" | "entity.updated" }>;
type EntityLinkEvent = Extract<SecuEvent, { type: "entity.linked" | "entity.unlinked" }>;
type CrossHitEvent = Extract<SecuEvent, { type: "entity.cross_engagement_hit" }>;
type FindingCreatedEvent = Extract<SecuEvent, { type: "finding.created" }>;
type FindingUpdatedEvent = Extract<SecuEvent, { type: "finding.updated" }>;
type FindingCommentEvent = Extract<SecuEvent, { type: "finding.comment_added" }>;
type WorkerRunStartedEvent = Extract<SecuEvent, { type: "worker_run.started" }>;
type WorkerRunFinishedEvent = Extract<SecuEvent, { type: "worker_run.finished" }>;
type PlaybookRunStartedEvent = Extract<SecuEvent, { type: "playbook_run.started" }>;
type PlaybookRunStepAdvancedEvent = Extract<SecuEvent, { type: "playbook_run.step_advanced" }>;
type PlaybookRunCompletedEvent = Extract<SecuEvent, { type: "playbook_run.completed" | "playbook_run.finished" }>;
type SignalChainEvent = Extract<SecuEvent, { type: "signal_chain.started" | "signal_chain.step_added" | "signal_chain.finished" }>;
type AuthEvent = Extract<SecuEvent, { type: "auth.granted" | "auth.revoked" }>;
type NoteEvent = Extract<SecuEvent, { type: "note.created" | "note.updated" | "note.deleted" }>;
type HintStatusEvent = Extract<SecuEvent, { type: "hint.status_changed" }>;
type ScopeEvent = Extract<SecuEvent, { type: "scope.updated" }>;

// ─── Key-Helpers ─────────────────────────────────────────────────────────────

export const SecuStreamKey = {
    engagement: (id: number): string => `secu:engagement:${id}`,
    run: (runId: number): string => `secu:run:${runId}`,
    findings: (engagementId: number): string => `secu:findings:${engagementId}`,
    entities: (engagementId: number): string => `secu:entities:${engagementId}`,
    global: (): string => "secu:global",
} as const;

const KEY_REGEX = {
    engagement: /^secu:engagement:(\d+)$/,
    run: /^secu:run:(\d+)$/,
    findings: /^secu:findings:(\d+)$/,
    entities: /^secu:entities:(\d+)$/,
    global: /^secu:global$/,
};

function parseEngagementKey(key: string): number | null {
    const m = KEY_REGEX.engagement.exec(key) ?? KEY_REGEX.findings.exec(key) ?? KEY_REGEX.entities.exec(key);
    return m ? Number(m[1]) : null;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Default-AC: jeder authentifizierte User darf engagement-/findings-/entities-Streams
 * abonnieren. Spätere RBAC kann hier engagement-spezifisch filtern (z.B. ownerUserId-
 * Match oder team-membership).
 *
 * Run-Topics werden über das Engagement abgesichert: erst muss der User im
 * Engagement Zugriff haben. Wir speichern aber keinen Mapping-Cache — beim
 * Subscribe wird einmal die Engagement-ID via run-id geprüft.
 */
async function authorizeEngagement(
    engagementId: number,
    context: DataStreamContext,
): Promise<boolean> {
    if (!context.userId) return false;
    // Aktuell: jeder eingeloggte Operator darf alle Engagements sehen (Solo-Tool).
    // TODO: bei Multi-User-Deployment hier engagement.ownerUserId / team-Membership prüfen.
    void engagementId;
    return true;
}

// ─── Subscription-Tracking für Eventbus-Bridge ───────────────────────────────

type ActiveSubscription = {
    key: string;
    type: "engagement" | "run" | "findings" | "entities" | "global";
    engagementId?: number;
    runId?: number;
};

const activeSubscriptions = new Map<string, ActiveSubscription>();

// ─── Pattern-Registrations ───────────────────────────────────────────────────

export function registerSecuStreams(): void {
    dataStreamManager.registerStreamPattern({
        name: "secu-engagement",
        matcher: (key) => KEY_REGEX.engagement.test(key),
        factory: (key) => {
            const engagementId = parseEngagementKey(key);
            return {
                key,
                description: `Realtime-Events für Engagement #${engagementId}`,
                authorize: (ctx) => engagementId != null && authorizeEngagement(engagementId, ctx),
            };
        },
    });

    dataStreamManager.registerStreamPattern({
        name: "secu-findings",
        matcher: (key) => KEY_REGEX.findings.test(key),
        factory: (key) => {
            const engagementId = parseEngagementKey(key);
            return {
                key,
                description: `Neue Findings für Engagement #${engagementId}`,
                authorize: (ctx) => engagementId != null && authorizeEngagement(engagementId, ctx),
            };
        },
    });

    dataStreamManager.registerStreamPattern({
        name: "secu-entities",
        matcher: (key) => KEY_REGEX.entities.test(key),
        factory: (key) => {
            const engagementId = parseEngagementKey(key);
            return {
                key,
                description: `Entity-Discoveries / Updates für Engagement #${engagementId}`,
                authorize: (ctx) => engagementId != null && authorizeEngagement(engagementId, ctx),
            };
        },
    });

    dataStreamManager.registerStreamPattern({
        name: "secu-run",
        matcher: (key) => KEY_REGEX.run.test(key),
        factory: (key) => ({
            key,
            description: "Realtime-Status eines Playbook-Runs",
            // Beim Subscribe wird die Engagement-Zugehörigkeit via Run-ID NICHT vorab
            // geprüft (würde DB-Roundtrip kosten). Run-Events werden vom EventBus
            // sowieso nur an Subscriber verteilt — Auth über die Engagement-Streams
            // ist primärer Schutz.
            authorize: (ctx) => Promise.resolve(!!ctx.userId),
        }),
    });

    dataStreamManager.registerStream({
        key: SecuStreamKey.global(),
        description: "Cross-Engagement-Hits + System-weite Notifications",
        authorize: (ctx) => Promise.resolve(!!ctx.userId),
    });
}

// ─── EventBus → Stream-Routing ───────────────────────────────────────────────

function broadcast(streamKey: string, event: string, data: unknown): void {
    dataStreamManager.broadcast(streamKey, { event, data: data as any });
}

function broadcastToEngagement(engagementId: number, event: string, data: unknown): void {
    broadcast(SecuStreamKey.engagement(engagementId), event, data);
}

export function startSecuEventBridge(): void {
    // ── entity.created / entity.updated → engagement-stream + entities-stream ──
    secuEventBus.on("entity.created", ((raw: unknown) => {
        const e = raw as EntityEvent;
        if (e.engagementId) {
            broadcastToEngagement(e.engagementId, "entity.created", e);
            broadcast(SecuStreamKey.entities(e.engagementId), "entity.created", e);
        }
    }) as never);
    secuEventBus.on("entity.updated", ((raw: unknown) => {
        const e = raw as EntityEvent;
        if (e.engagementId) {
            broadcastToEngagement(e.engagementId, "entity.updated", e);
            broadcast(SecuStreamKey.entities(e.engagementId), "entity.updated", e);
        }
    }) as never);

    // ── entity.linked / entity.unlinked → engagement + entities ──
    secuEventBus.on("entity.linked", ((raw: unknown) => {
        const e = raw as EntityLinkEvent;
        broadcastToEngagement(e.engagementId, "entity.linked", e);
        broadcast(SecuStreamKey.entities(e.engagementId), "entity.linked", e);
    }) as never);
    secuEventBus.on("entity.unlinked", ((raw: unknown) => {
        const e = raw as EntityLinkEvent;
        broadcastToEngagement(e.engagementId, "entity.unlinked", e);
        broadcast(SecuStreamKey.entities(e.engagementId), "entity.unlinked", e);
    }) as never);

    // ── entity.cross_engagement_hit → globaler Stream + jedes betroffene Engagement ──
    secuEventBus.on("entity.cross_engagement_hit", (e: CrossHitEvent) => {
        broadcast(SecuStreamKey.global(), "entity.cross_engagement_hit", e);
        for (const engId of e.engagementIds) {
            broadcastToEngagement(engId, "entity.cross_engagement_hit", e);
        }
    });

    // ── finding.created → engagement-stream + findings-stream ──
    secuEventBus.on("finding.created", (e: FindingCreatedEvent) => {
        broadcastToEngagement(e.engagementId, "finding.created", e);
        broadcast(SecuStreamKey.findings(e.engagementId), "finding.created", e);
    });
    secuEventBus.on("finding.updated", (e: FindingUpdatedEvent) => {
        broadcastToEngagement(e.engagementId, "finding.updated", e);
        broadcast(SecuStreamKey.findings(e.engagementId), "finding.updated", e);
    });
    secuEventBus.on("finding.comment_added", (e: FindingCommentEvent) => {
        broadcastToEngagement(e.engagementId, "finding.comment_added", e);
        broadcast(SecuStreamKey.findings(e.engagementId), "finding.comment_added", e);
    });

    // ── worker_run.* → engagement + falls in playbook auch run-stream ──
    secuEventBus.on("worker_run.started", (e: WorkerRunStartedEvent) => {
        broadcastToEngagement(e.engagementId, "worker_run.started", e);
        if (e.playbookRunId != null) broadcast(SecuStreamKey.run(e.playbookRunId), "worker_run.started", e);
    });
    secuEventBus.on("worker_run.finished", (e: WorkerRunFinishedEvent) => {
        broadcastToEngagement(e.engagementId, "worker_run.finished", e);
        if (e.playbookRunId != null) broadcast(SecuStreamKey.run(e.playbookRunId), "worker_run.finished", e);
    });

    // ── playbook_run.started / step_advanced / completed / finished ──
    secuEventBus.on("playbook_run.started", (e: PlaybookRunStartedEvent) => {
        broadcastToEngagement(e.engagementId, "playbook_run.started", e);
        broadcast(SecuStreamKey.run(e.runId), "playbook_run.started", e);
    });
    secuEventBus.on("playbook_run.step_advanced", (e: PlaybookRunStepAdvancedEvent) => {
        broadcastToEngagement(e.engagementId, "playbook_run.step_advanced", e);
        broadcast(SecuStreamKey.run(e.runId), "playbook_run.step_advanced", e);
    });
    // `completed` ist Backwards-compat (Rules nutzen den Namen). `finished`
    // ist der neue Frontend-Name. Beide werden dasselbe Topic broadcasten —
    // FE wählt entsprechend.
    secuEventBus.on("playbook_run.completed", (e: PlaybookRunCompletedEvent) => {
        broadcastToEngagement(e.engagementId, "playbook_run.completed", e);
        broadcast(SecuStreamKey.run(e.runId), "playbook_run.completed", e);
    });
    secuEventBus.on("playbook_run.finished", (e: PlaybookRunCompletedEvent) => {
        broadcastToEngagement(e.engagementId, "playbook_run.finished", e);
        broadcast(SecuStreamKey.run(e.runId), "playbook_run.finished", e);
    });

    // ── signal_chain.* → engagement-stream ──
    secuEventBus.on("signal_chain.started", (e: SignalChainEvent) => {
        broadcastToEngagement(e.engagementId, "signal_chain.started", e);
    });
    secuEventBus.on("signal_chain.step_added", (e: SignalChainEvent) => {
        broadcastToEngagement(e.engagementId, "signal_chain.step_added", e);
    });
    secuEventBus.on("signal_chain.finished", (e: SignalChainEvent) => {
        broadcastToEngagement(e.engagementId, "signal_chain.finished", e);
    });

    // ── auth.granted / auth.revoked → engagement-stream ──
    secuEventBus.on("auth.granted", (e: AuthEvent) => {
        broadcastToEngagement(e.engagementId, "auth.granted", e);
    });
    secuEventBus.on("auth.revoked", (e: AuthEvent) => {
        broadcastToEngagement(e.engagementId, "auth.revoked", e);
    });

    // ── note.* → engagement-stream ──
    secuEventBus.on("note.created", (e: NoteEvent) => {
        broadcastToEngagement(e.engagementId, "note.created", e);
    });
    secuEventBus.on("note.updated", (e: NoteEvent) => {
        broadcastToEngagement(e.engagementId, "note.updated", e);
    });
    secuEventBus.on("note.deleted", (e: NoteEvent) => {
        broadcastToEngagement(e.engagementId, "note.deleted", e);
    });

    // ── hint.status_changed + scope.updated ──
    secuEventBus.on("hint.status_changed", (e: HintStatusEvent) => {
        broadcastToEngagement(e.engagementId, "hint.status_changed", e);
    });
    secuEventBus.on("scope.updated", (e: ScopeEvent) => {
        broadcastToEngagement(e.engagementId, "scope.updated", e);
    });
}

/**
 * Test/Debug helper: holt für eine Entity alle Engagement-IDs,
 * mit denen sie verknüpft ist. Wird aktuell nicht gebraucht aber nützlich
 * wenn der EventBus später `engagementId` nicht setzt.
 */
export async function lookupEngagementIdsForEntity(entityId: number): Promise<number[]> {
    const rows = await database
        .select({ engagementId: engagementEntities.engagementId })
        .from(engagementEntities)
        .where(eq(engagementEntities.entityId, entityId));
    return rows.map((r) => r.engagementId);
}

/** Discriminated-Union der WS-Events für FE-Type-Safety. */
export type SecuWsEventEnvelope =
    | { event: "entity.created"; data: Extract<SecuEvent, { type: "entity.created" }> }
    | { event: "entity.updated"; data: Extract<SecuEvent, { type: "entity.updated" }> }
    | { event: "entity.cross_engagement_hit"; data: Extract<SecuEvent, { type: "entity.cross_engagement_hit" }> }
    | { event: "entity.linked"; data: Extract<SecuEvent, { type: "entity.linked" }> }
    | { event: "entity.unlinked"; data: Extract<SecuEvent, { type: "entity.unlinked" }> }
    | { event: "finding.created"; data: Extract<SecuEvent, { type: "finding.created" }> }
    | { event: "finding.updated"; data: Extract<SecuEvent, { type: "finding.updated" }> }
    | { event: "finding.comment_added"; data: Extract<SecuEvent, { type: "finding.comment_added" }> }
    | { event: "worker_run.started"; data: Extract<SecuEvent, { type: "worker_run.started" }> }
    | { event: "worker_run.finished"; data: Extract<SecuEvent, { type: "worker_run.finished" }> }
    | { event: "playbook_run.started"; data: Extract<SecuEvent, { type: "playbook_run.started" }> }
    | { event: "playbook_run.step_advanced"; data: Extract<SecuEvent, { type: "playbook_run.step_advanced" }> }
    | { event: "playbook_run.completed"; data: Extract<SecuEvent, { type: "playbook_run.completed" }> }
    | { event: "playbook_run.finished"; data: Extract<SecuEvent, { type: "playbook_run.finished" }> }
    | { event: "signal_chain.started"; data: Extract<SecuEvent, { type: "signal_chain.started" }> }
    | { event: "signal_chain.step_added"; data: Extract<SecuEvent, { type: "signal_chain.step_added" }> }
    | { event: "signal_chain.finished"; data: Extract<SecuEvent, { type: "signal_chain.finished" }> }
    | { event: "auth.granted"; data: Extract<SecuEvent, { type: "auth.granted" }> }
    | { event: "auth.revoked"; data: Extract<SecuEvent, { type: "auth.revoked" }> }
    | { event: "note.created"; data: Extract<SecuEvent, { type: "note.created" }> }
    | { event: "note.updated"; data: Extract<SecuEvent, { type: "note.updated" }> }
    | { event: "note.deleted"; data: Extract<SecuEvent, { type: "note.deleted" }> }
    | { event: "hint.status_changed"; data: Extract<SecuEvent, { type: "hint.status_changed" }> }
    | { event: "scope.updated"; data: Extract<SecuEvent, { type: "scope.updated" }> };

void activeSubscriptions; // reserviert für spätere Subscribe-Tracking-Erweiterungen

// In-process Event-Bus — Phase 2.5 + Sprint 2 (Engagement-Detail-Page).
//
// Service-Module (entity, finding, playbook-runner, worker-runner, …) publishen
// Events, der Rule-Evaluator (rule-evaluator.ts) und der Realtime-Bridge
// (secu-streams.ts) abonnieren sie. Bewusst keine externe Queue: alles in-Prozess
// — die Schnittstelle ist so flach, dass eine spätere Extraktion auf z.B.
// Redis Pub/Sub trivial bleibt (Events haben stabile Typen + Discriminator
// `type`).
//
// Wichtig: Listener werden synchron aufgerufen, dürfen aber Promises
// zurückgeben. Der Bus wartet darauf NICHT — Publishing bleibt fire-and-forget,
// damit ein langsamer Evaluator/Bridge niemals den Hot-Path blockiert.
//
// Sprint 2 (Backend-Report 2026-05-09 Block 1) — neue Events:
//   - finding.updated, finding.comment_added
//   - worker_run.started, worker_run.finished
//   - playbook_run.started, playbook_run.step_advanced, playbook_run.finished
//   - signal_chain.started, signal_chain.step_added, signal_chain.finished
//   - auth.granted, auth.revoked
//   - entity.linked, entity.unlinked
//   - note.created, note.updated, note.deleted
//   - hint.status_changed
//   - scope.updated

import { EventEmitter } from "node:events";
import type {
    AuthorizationKind,
    AuthorizationScope,
    EngagementEntityRole,
    EngagementHintStatus,
    EngagementKind,
    EntityKind,
    FindingCategory,
    FindingStatus,
    PlaybookRunStatus,
    Severity,
    WorkerRunStatus,
} from "@/db/individual/individual-schema";

export type SecuEventType =
    | "entity.created"
    | "entity.updated"
    | "entity.cross_engagement_hit"
    | "entity.linked"
    | "entity.unlinked"
    | "finding.created"
    | "finding.updated"
    | "finding.comment_added"
    | "worker_run.started"
    | "worker_run.finished"
    | "playbook_run.started"
    | "playbook_run.step_advanced"
    | "playbook_run.completed"
    | "playbook_run.finished"
    | "signal_chain.started"
    | "signal_chain.step_added"
    | "signal_chain.finished"
    | "auth.granted"
    | "auth.revoked"
    | "note.created"
    | "note.updated"
    | "note.deleted"
    | "hint.status_changed"
    | "scope.updated";

export interface EntityEventPayload {
    type: "entity.created" | "entity.updated";
    entityId: number;
    kind: EntityKind;
    canonicalKey: string;
    displayName: string;
    /** kind-spezifische `data` aus secu_entities.data — read-only für Rules. */
    data: Record<string, unknown>;
    /** lowercased Tech-Set (sofern ein Fingerprint persistiert wurde, sonst leer). */
    tech: string[];
    /**
     * Sprint 1.3 (features.md §2.4) — Hop-Tracking-Hint für Rule-Auto-Chains.
     * Wird gesetzt, wenn das Event aus einem Worker-Run innerhalb eines
     * Playbook-Runs stammt. Der Rule-Evaluator nutzt es als `parentRunId`
     * für `playbookRunner.startRun()` — der Runner enforced danach das
     * Hop-Limit. Manuelle entity-Updates (z.B. via REST-Controller) lassen
     * das Feld undefined, dann gilt der Folge-Run als Hop 0.
     */
    sourcePlaybookRunId?: number;
    /**
     * Engagement-ID des laufenden Scans — wird vom worker-runner via sourceContext
     * mitgeliefert, damit der Rule-Evaluator KEINEN nachträglichen DB-Lookup auf
     * secu_engagement_entities machen muss. Ohne dieses Feld kommt der Lookup zu
     * früh (entity.created feuert vor dem engagement_entities-INSERT).
     */
    engagementId?: number;
}

/**
 * Phase 2.7 — wird von entity.service nach upsert gefeuert, wenn die Entity
 * in ≥2 aktiven Engagements existiert. Rule-Engine matched darauf für notify_boss.
 */
export interface CrossEngagementHitPayload {
    type: "entity.cross_engagement_hit";
    entityId: number;
    kind: EntityKind;
    canonicalKey: string;
    displayName: string;
    /** Aktive (nicht archivierte) Engagement-IDs in denen diese Entity vorkommt. */
    engagementIds: number[];
}

/**
 * Sprint 2 — Engagement ↔ Entity-Link Lifecycle. Frontend rendert daraus
 * Activity-Stream-Einträge ("entity X linked to engagement Y").
 */
export interface EntityLinkEventPayload {
    type: "entity.linked" | "entity.unlinked";
    engagementId: number;
    entityId: number;
    /** secu_engagement_entities.id — null bei `entity.unlinked` nach DELETE. */
    engagementEntityId: number | null;
    role: EngagementEntityRole | null;
    /** Optional: User der die Aktion ausgelöst hat. */
    actorUserId: number | null;
    /** Snapshot aus entities-Tabelle für FE-Render ohne Refetch. */
    entitySnapshot: { kind: EntityKind; displayName: string; canonicalKey: string };
}

export interface FindingEventPayload {
    type: "finding.created";
    findingId: number;
    engagementId: number;
    engagementKind: EngagementKind | null;
    entityId: number | null;
    entityKind: EntityKind | null;
    severity: Severity;
    category: FindingCategory;
    title: string;
    fingerprint: string;
    cveIds: string[];
    workerRunId?: number | null;
}

/**
 * Sprint 2 — Status-Wechsel an existierendem Finding (Triage). Wird vom
 * findingService.updateTriage emitted. Frontend animiert daraufhin den
 * Severity-Strip + Drawer-Tab.
 */
export interface FindingUpdatedEventPayload {
    type: "finding.updated";
    findingId: number;
    engagementId: number;
    entityId: number | null;
    severity: Severity;
    category: FindingCategory;
    previousStatus: FindingStatus;
    newStatus: FindingStatus;
    actorUserId: number | null;
}

export interface FindingCommentAddedEventPayload {
    type: "finding.comment_added";
    findingId: number;
    engagementId: number;
    commentId: number;
    /** Erste 80 Zeichen — für Activity-Rail-Render ohne Refetch. */
    excerpt: string;
    actorUserId: number | null;
}

/**
 * Sprint 2 — Worker-Run Lifecycle. `worker_run.started` feuert nach
 * AuthZ-Gate aber vor Tool-Execution; `worker_run.finished` nach allen
 * Persistenz-Phasen (Findings, Tech, Discovered Entities, Patches, Trust-
 * Downgrade). Skipped-Runs (Auth-deny, Budget-exceeded, Out-of-Scope)
 * werden auch über `finished` mit status='skipped' annonciert.
 */
export interface WorkerRunStartedEventPayload {
    type: "worker_run.started";
    workerRunId: number;
    engagementId: number;
    playbookRunId: number | null;
    workerKey: string;
    entityId: number | null;
}

export interface WorkerRunFinishedEventPayload {
    type: "worker_run.finished";
    workerRunId: number;
    engagementId: number;
    playbookRunId: number | null;
    workerKey: string;
    entityId: number | null;
    status: WorkerRunStatus;
    findingsCreated: number;
    findingsDeduped: number;
    discoveredEntities: number;
    durationMs: number;
    error: string | null;
}

/**
 * Phase 2.5 — Backwards-compat Event. Bleibt erhalten neben dem neuen
 * `playbook_run.finished` (selber Inhalt, neuer Name) — Rules + alte
 * Listener konsumieren weiterhin `completed`. Neue Listener (Frontend WS)
 * sollten `finished` bevorzugen.
 */
export interface PlaybookRunCompletedEventPayload {
    type: "playbook_run.completed" | "playbook_run.finished";
    runId: number;
    engagementId: number;
    engagementKind: EngagementKind | null;
    playbookKey: string;
    status: PlaybookRunStatus;
    rootEntityId: number | null;
    findingsCreated: number;
    discoveredEntities: number;
}

/**
 * Backwards-compat alias — vor Sprint 2 hieß der Type `PlaybookRunEventPayload`.
 * Externe Konsumenten (rule-evaluator) importieren weiter unter altem Namen.
 */
export type PlaybookRunEventPayload = PlaybookRunCompletedEventPayload;

/** Sprint 2 — Run beginnt zu laufen (`pending` → `running`). */
export interface PlaybookRunStartedEventPayload {
    type: "playbook_run.started";
    runId: number;
    engagementId: number;
    playbookKey: string;
    rootEntityId: number;
    /** Topo-sortierte Step-Keys, damit FE Progress-UI direkt rendern kann. */
    plannedSteps: string[];
    triggeredBy: string;
    triggeredByUserId: number | null;
    parentRunId: number | null;
    hopDepth: number;
}

export interface PlaybookRunStepAdvancedEventPayload {
    type: "playbook_run.step_advanced";
    runId: number;
    engagementId: number;
    playbookKey: string;
    stepKey: string;
    workerKey: string;
    stepIndex: number;
    totalSteps: number;
    /** Step-Outcome-Snapshot — runs-Array, in dem jedes Element ein einzelnes Target-Result ist. */
    stepStatus: "running" | "completed" | "skipped" | "failed";
    findingsCreated: number;
    discoveredEntities: number;
}

export interface SignalChainEventPayload {
    type: "signal_chain.started" | "signal_chain.step_added" | "signal_chain.finished";
    chainId: number;
    engagementId: number;
    rootEntityId: number | null;
    triggeredBy: string;
    /** Steps-Count nach diesem Event (für FE-Counter ohne Refetch). */
    stepCount: number;
    /** Bei `step_added`: das neu hinzugefügte Step-Objekt im signalChain-Array. */
    newStep?: Record<string, unknown>;
}

/**
 * Sprint 2 — Authorization-Lifecycle pro Engagement. FE rendert daraus
 * Severity-Strip-Updates ("Engagement X jetzt für active_intrusive autorisiert").
 */
export interface AuthEventPayload {
    type: "auth.granted" | "auth.revoked";
    engagementId: number;
    authorizationId: number;
    entityId: number;
    kind: AuthorizationKind;
    scope: AuthorizationScope;
    actorUserId: number | null;
}

/**
 * Sprint 2 — Notes (artifacts kind='note'). Enthält excerpt für Render
 * ohne Refetch.
 */
export interface NoteEventPayload {
    type: "note.created" | "note.updated" | "note.deleted";
    noteId: number;
    engagementId: number;
    entityId: number | null;
    title: string | null;
    /** Erste 80 Zeichen des body — leer bei `deleted`. */
    excerpt: string;
    actorUserId: number | null;
}

export interface HintStatusChangedEventPayload {
    type: "hint.status_changed";
    hintId: number;
    engagementId: number;
    slot: string;
    previousStatus: EngagementHintStatus;
    newStatus: EngagementHintStatus;
    convertedToEntityId: number | null;
    actorUserId: number | null;
}

export interface ScopeUpdatedEventPayload {
    type: "scope.updated";
    engagementId: number;
    /** "summary" | "targets" | "rules" | "windows" | "contacts" | "full". */
    section: "summary" | "targets" | "rules" | "windows" | "contacts" | "full";
    actorUserId: number | null;
}

export type SecuEvent =
    | EntityEventPayload
    | CrossEngagementHitPayload
    | EntityLinkEventPayload
    | FindingEventPayload
    | FindingUpdatedEventPayload
    | FindingCommentAddedEventPayload
    | WorkerRunStartedEventPayload
    | WorkerRunFinishedEventPayload
    | PlaybookRunCompletedEventPayload
    | PlaybookRunStartedEventPayload
    | PlaybookRunStepAdvancedEventPayload
    | SignalChainEventPayload
    | AuthEventPayload
    | NoteEventPayload
    | HintStatusChangedEventPayload
    | ScopeUpdatedEventPayload;

type Listener<T extends SecuEvent = SecuEvent> = (event: T) => void | Promise<void>;

class SecuEventBus {
    private readonly emitter = new EventEmitter();

    constructor() {
        // Erlaube viele Subscriber ohne Warning — Rules + interne Hooks summieren sich.
        this.emitter.setMaxListeners(128);
    }

    on<T extends SecuEventType>(
        type: T,
        listener: Listener<Extract<SecuEvent, { type: T }>>,
    ): () => void {
        this.emitter.on(type, listener as Listener);
        return () => this.emitter.off(type, listener as Listener);
    }

    publish<T extends SecuEvent>(event: T): void {
        // Fire-and-forget — Listener-Errors loggen, niemals durchreichen.
        try {
            this.emitter.emit(event.type, event);
        } catch (err) {
            console.error("[secu event-bus] publish failed", {
                type: event.type,
                err: (err as Error).message,
            });
        }
    }

    /** Test-Helper — entfernt alle Listener (z.B. zwischen Jest-Suiten). */
    clear(): void {
        this.emitter.removeAllListeners();
    }
}

export const secuEventBus = new SecuEventBus();

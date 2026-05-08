// In-process Event-Bus — Phase 2.5.
//
// Service-Module (entity, finding, playbook-runner) publishen Events, der
// Rule-Evaluator (rule-evaluator.ts) abonniert sie. Bewusst keine externe
// Queue: Phase 2.5 läuft Solo-Use, alles in einem Prozess. Die Schnittstelle
// ist so flach, dass eine spätere Extraktion auf z.B. Redis Pub/Sub trivial
// bleibt — Events haben stabile Typen.
//
// Wichtig: Listener werden synchron aufgerufen, dürfen aber Promises
// zurückgeben. Der Bus wartet darauf NICHT — Publishing bleibt fire-and-forget,
// damit ein langsamer Evaluator niemals den Hot-Path blockiert.

import { EventEmitter } from "node:events";
import type {
    EngagementKind,
    EntityKind,
    FindingCategory,
    PlaybookRunStatus,
    Severity,
} from "@/db/individual/individual-schema";

export type SecuEventType =
    | "entity.created"
    | "entity.updated"
    | "entity.cross_engagement_hit"
    | "finding.created"
    | "playbook_run.completed";

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
}

export interface PlaybookRunEventPayload {
    type: "playbook_run.completed";
    runId: number;
    engagementId: number;
    engagementKind: EngagementKind | null;
    playbookKey: string;
    status: PlaybookRunStatus;
    rootEntityId: number | null;
    findingsCreated: number;
    discoveredEntities: number;
}

export type SecuEvent =
    | EntityEventPayload
    | CrossEngagementHitPayload
    | FindingEventPayload
    | PlaybookRunEventPayload;

type Listener<T extends SecuEvent = SecuEvent> = (event: T) => void | Promise<void>;

class SecuEventBus {
    private readonly emitter = new EventEmitter();

    constructor() {
        // Erlaube viele Subscriber ohne Warning — Rules + interne Hooks summieren sich.
        this.emitter.setMaxListeners(64);
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

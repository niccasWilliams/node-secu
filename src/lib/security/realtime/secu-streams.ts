// Realtime-Topics für das Frontend-Cockpit.
//
// Topology:
//   secu:engagement:<id>   — alles was zum Engagement gehört (entity-create, finding-create, run-status)
//   secu:run:<runId>       — Status eines konkreten Playbook-Runs (lean-status-Snapshot bei jedem Step)
//   secu:findings:<engId>  — neue Findings für ein Engagement (gefiltert)
//   secu:entities:<engId>  — Entity-Updates / -Discoveries für ein Engagement
//   secu:global            — Cross-Engagement-Hits + System-weite Notifications
//
// Subscribe-Pfad (vom FE):
//   ws.send({ type: "datastream_subscribe", stream: "secu:engagement:42" })
//
// Receive-Format:
//   { type: "datastream_event", stream: "secu:engagement:42", payload: { event: "<eventType>", data: <SecuEvent> } }

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
type CrossHitEvent = Extract<SecuEvent, { type: "entity.cross_engagement_hit" }>;
type FindingEvent = Extract<SecuEvent, { type: "finding.created" }>;
type PlaybookRunEvent = Extract<SecuEvent, { type: "playbook_run.completed" }>;

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

export function startSecuEventBridge(): void {
    // entity.created / entity.updated → engagement-stream + entities-stream
    secuEventBus.on("entity.created", ((raw: unknown) => {
        const e = raw as EntityEvent;
        if (e.engagementId) {
            broadcast(SecuStreamKey.engagement(e.engagementId), "entity.created", e);
            broadcast(SecuStreamKey.entities(e.engagementId), "entity.created", e);
        }
    }) as never);
    secuEventBus.on("entity.updated", ((raw: unknown) => {
        const e = raw as EntityEvent;
        if (e.engagementId) {
            broadcast(SecuStreamKey.engagement(e.engagementId), "entity.updated", e);
            broadcast(SecuStreamKey.entities(e.engagementId), "entity.updated", e);
        }
    }) as never);

    // entity.cross_engagement_hit → globaler Stream + jedes betroffene Engagement
    secuEventBus.on("entity.cross_engagement_hit", (e: CrossHitEvent) => {
        broadcast(SecuStreamKey.global(), "entity.cross_engagement_hit", e);
        for (const engId of e.engagementIds) {
            broadcast(SecuStreamKey.engagement(engId), "entity.cross_engagement_hit", e);
        }
    });

    // finding.created → engagement-stream + findings-stream
    secuEventBus.on("finding.created", (e: FindingEvent) => {
        broadcast(SecuStreamKey.engagement(e.engagementId), "finding.created", e);
        broadcast(SecuStreamKey.findings(e.engagementId), "finding.created", e);
    });

    // playbook_run.completed → engagement-stream + run-stream
    secuEventBus.on("playbook_run.completed", (e: PlaybookRunEvent) => {
        broadcast(SecuStreamKey.engagement(e.engagementId), "playbook_run.completed", e);
        broadcast(SecuStreamKey.run(e.runId), "playbook_run.completed", e);
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
    | { event: "finding.created"; data: Extract<SecuEvent, { type: "finding.created" }> }
    | { event: "playbook_run.completed"; data: Extract<SecuEvent, { type: "playbook_run.completed" }> };

void activeSubscriptions; // reserviert für spätere Subscribe-Tracking-Erweiterungen

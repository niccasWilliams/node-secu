// Rule-Evaluator — Phase 2.5.
//
// Abonniert beim Bootstrap alle relevanten Event-Bus-Topics, lädt die enabled
// Rules pro Event aus dem ruleService-Cache, prüft Scope + JSON-Logic-Condition
// und führt die Action aus. Jede Auslösung schreibt in `secu_audit_log` mit
// `action="rule.fired"` und Rule-Id, plus Action-Result. Action-Failures werden
// gefangen und ebenfalls auditiert (`success=false`), damit eine kaputte Rule
// nicht den ganzen Bus mitreißt.

import { desc, eq } from "drizzle-orm";
import axios from "axios";
import { database } from "@/db";
import {
    engagementEntities,
    engagements,
    type EngagementKind,
    type Rule,
} from "@/db/individual/individual-schema";

import { auditLogService } from "../audit/audit-log.service";
import { entityService } from "../entities/entity.service";
import { findingService } from "../findings/finding.service";
import { playbookRunner } from "../playbooks/playbook-runner";

import {
    secuEventBus,
    type EntityEventPayload,
    type FindingEventPayload,
    type PlaybookRunEventPayload,
    type SecuEvent,
    type SecuEventType,
} from "./event-bus";
import { evaluateJsonLogic, JsonLogicError, type JsonLogic } from "./json-logic";
import { ruleService } from "./rule.service";

let started = false;
const unsubs: Array<() => void> = [];

export function startRuleEvaluator(): void {
    if (started) return;
    started = true;

    const triggers: SecuEventType[] = [
        "entity.created",
        "entity.updated",
        "finding.created",
        "playbook_run.completed",
    ];

    for (const t of triggers) {
        unsubs.push(secuEventBus.on(t, async (event) => {
            try {
                await processEvent(event);
            } catch (err) {
                console.error("[rule-evaluator] processEvent failed", {
                    type: t,
                    err: (err as Error).message,
                });
            }
        }));
    }
}

export function stopRuleEvaluator(): void {
    while (unsubs.length) unsubs.pop()?.();
    started = false;
}

async function processEvent(event: SecuEvent): Promise<void> {
    // Phase 2.7 — `entity.cross_engagement_hit` ist KEIN DB-Rule-Trigger (siehe
    // bootstrap.ts für Direct-Listener). Wir filtern hier, weil SecuEventType
    // breiter ist als ruleTriggerEnum.
    if (event.type === "entity.cross_engagement_hit") return;
    const candidates = await ruleService.getEnabledForTrigger(event.type);
    if (candidates.length === 0) return;

    const data = await buildConditionData(event);

    for (const rule of candidates) {
        // Trust-Layer (FULL_SCAN.md §1.5.2): jede Rule-Evaluation, deren Scope
        // zum Event passt, schreibt einen `rule.evaluated`-Audit-Eintrag —
        // unabhängig davon, ob die Condition true wird. Ohne diese Spur war in
        // Run #7 nicht nachvollziehbar, *warum* fire_count=0 blieb. Scope-
        // Mismatches loggen wir bewusst nicht (zu noisy).
        const scopeOk = matchesScope(rule, data);
        if (!scopeOk) continue;

        let conditionPass = true;
        let conditionError: string | null = null;
        if (rule.condition) {
            try {
                conditionPass = Boolean(evaluateJsonLogic(rule.condition as JsonLogic, data));
            } catch (err) {
                conditionError = err instanceof JsonLogicError ? err.message : (err as Error).message;
                conditionPass = false;
            }
        }

        // Audit-Eintrag schreiben BEVOR wir feuern — damit auch bei einer
        // fire-Exception der Evaluation-Trail erhalten bleibt. Fire-and-forget,
        // weil das im Hot-Path liegt; persist-Fehler ist non-fatal.
        void auditLogService.log({
            action: conditionError ? "rule.condition_failed" : "rule.evaluated",
            engagementId: data.engagement?.id ?? null,
            targetType: "rule",
            targetId: rule.id,
            payload: {
                eventType: event.type,
                ruleName: rule.name,
                conditionResult: conditionPass,
                willFire: conditionPass && !conditionError,
                conditionError,
            },
            success: !conditionError,
            errorMessage: conditionError ?? undefined,
        });

        if (conditionError) continue;
        if (!conditionPass) continue;

        await fireRule(rule, event, data);
    }
}

function matchesScope(rule: Rule, data: ConditionData): boolean {
    const scope = rule.scope.trim();
    if (!scope || scope === "global") return true;
    if (scope.startsWith("engagement_kind:")) {
        return data.engagement?.kind === scope.slice("engagement_kind:".length);
    }
    if (scope.startsWith("engagement:")) {
        const id = Number(scope.slice("engagement:".length));
        return Number.isFinite(id) && data.engagement?.id === id;
    }
    return false;
}

async function fireRule(rule: Rule, event: SecuEvent, data: ConditionData): Promise<void> {
    const params = (rule.actionParams ?? {}) as Record<string, unknown>;
    let actionResult: Record<string, unknown> = {};
    let success = true;
    let errorMessage: string | undefined;

    try {
        switch (rule.action) {
            case "tag_entity":
                actionResult = await actTagEntity(params, event, data);
                break;
            case "start_playbook":
                actionResult = await actStartPlaybook(params, event, data);
                break;
            case "notify_boss":
                actionResult = await actNotifyBoss(rule, params, event, data);
                break;
            case "create_finding":
                actionResult = await actCreateFinding(params, event, data);
                break;
            default:
                throw new Error(`unsupported rule action: ${rule.action}`);
        }
    } catch (err) {
        success = false;
        errorMessage = (err as Error).message;
    }

    await ruleService.recordFire(rule.id);

    await auditLogService.log({
        action: "rule.fired",
        engagementId: data.engagement?.id ?? null,
        targetType: "rule",
        targetId: rule.id,
        payload: {
            eventType: event.type,
            ruleName: rule.name,
            actionType: rule.action,
            actionResult,
        },
        success,
        errorMessage,
    });
}

// ─── Condition-Data ─────────────────────────────────────────────────────────

interface ConditionData {
    event: SecuEvent;
    engagement: { id: number; kind: EngagementKind } | null;
    entity?: { id: number; kind: string; canonicalKey: string; tech: string[]; data: Record<string, unknown> };
    finding?: { severity: string; category: string; cveIds: string[] };
    playbookRun?: { key: string; status: string; findingsCreated: number };
    [extra: string]: unknown;
}

async function buildConditionData(event: SecuEvent): Promise<ConditionData> {
    const data: ConditionData = { event, engagement: null };

    if (event.type === "entity.created" || event.type === "entity.updated") {
        const e = event as EntityEventPayload;
        data.entity = {
            id: e.entityId,
            kind: e.kind,
            canonicalKey: e.canonicalKey,
            tech: e.tech,
            data: e.data,
        };
        // Bug-Fix (Run #1, 2026-05-08): entity.updated-Events trugen keinen
        // engagement-Kontext, dadurch failed `start_playbook`-Actions mit
        // "no engagement in scope" — exakt der Fall der Rule 8 (rest_api →
        // api_security_active) im Run #1 gegen geilemukke.de blockiert hat.
        // Lösung: Entity → linked Engagement via `secu_engagement_entities`.
        // Bei N:M nehmen wir das jüngste Linkage (typisch: das gerade aktive
        // Engagement des Scans). Rules können via `scope=engagement:N` weiter
        // einschränken.
        data.engagement = await loadEngagementForEntity(e.entityId);
    }

    if (event.type === "finding.created") {
        const f = event as FindingEventPayload;
        data.engagement = await loadEngagement(f.engagementId);
        data.finding = {
            severity: f.severity,
            category: f.category,
            cveIds: f.cveIds,
        };
        if (f.entityId) {
            const ent = await entityService.getById(f.entityId);
            if (ent) {
                data.entity = {
                    id: ent.id,
                    kind: ent.kind,
                    canonicalKey: ent.canonicalKey,
                    tech: extractTech(ent.data),
                    data: ent.data ?? {},
                };
            }
        }
    }

    if (event.type === "playbook_run.completed") {
        const p = event as PlaybookRunEventPayload;
        data.engagement = await loadEngagement(p.engagementId);
        data.playbookRun = {
            key: p.playbookKey,
            status: p.status,
            findingsCreated: p.findingsCreated,
        };
    }

    return data;
}

async function loadEngagement(id: number): Promise<{ id: number; kind: EngagementKind } | null> {
    const [row] = await database
        .select({ id: engagements.id, kind: engagements.kind })
        .from(engagements)
        .where(eq(engagements.id, id))
        .limit(1);
    return row ?? null;
}

/**
 * Findet das jüngste Engagement, das dieses Entity verlinkt hat. Wird für
 * entity.updated/entity.created-Events benutzt, weil diese Events selbst
 * keinen Engagement-Kontext tragen (Entities sind global). Liefert null wenn
 * das Entity (noch) keiner Engagement angehört.
 */
async function loadEngagementForEntity(
    entityId: number,
): Promise<{ id: number; kind: EngagementKind } | null> {
    const [row] = await database
        .select({ id: engagements.id, kind: engagements.kind })
        .from(engagementEntities)
        .innerJoin(engagements, eq(engagementEntities.engagementId, engagements.id))
        .where(eq(engagementEntities.entityId, entityId))
        .orderBy(desc(engagementEntities.addedAt))
        .limit(1);
    return row ?? null;
}

function extractTech(data: Record<string, unknown> | null): string[] {
    if (!data) return [];
    const tech = (data as { tech?: unknown }).tech;
    if (!Array.isArray(tech)) return [];
    return tech
        .map((t) => (typeof t === "string" ? t.toLowerCase() : (t && typeof t === "object" && "name" in (t as object)) ? String((t as { name: unknown }).name).toLowerCase() : ""))
        .filter((t) => t);
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function actTagEntity(
    params: Record<string, unknown>,
    event: SecuEvent,
    data: ConditionData,
): Promise<Record<string, unknown>> {
    const tag = String(params.tag ?? "").trim();
    if (!tag) throw new Error("tag_entity.params.tag is required");
    const color = typeof params.color === "string" ? params.color : null;

    const targetEntityId = resolveEntityId(params.entityIdFrom, event, data);
    if (!targetEntityId) throw new Error("tag_entity: no entity in event/condition data");

    await entityService.addTag(targetEntityId, tag, color);
    return { taggedEntityId: targetEntityId, tag };
}

async function actStartPlaybook(
    params: Record<string, unknown>,
    event: SecuEvent,
    data: ConditionData,
): Promise<Record<string, unknown>> {
    const playbookKey = String(params.playbookKey ?? "").trim();
    if (!playbookKey) throw new Error("start_playbook.params.playbookKey is required");

    const engagementId = data.engagement?.id ?? resolveEngagementId(event);
    if (!engagementId) throw new Error("start_playbook: no engagement in scope");

    const rootEntityId = resolveEntityId(params.rootEntityIdFrom ?? "entity.id", event, data);
    if (!rootEntityId) throw new Error("start_playbook: cannot resolve rootEntityId");

    // Sprint 1.3 (features.md §2.4) — Hop-Tracking. Wenn das Event aus einem
    // Worker-Run innerhalb eines Playbook-Runs stammt, wird dessen ID als
    // parent gegeben; der playbookRunner errechnet hopDepth daraus und blockt
    // wenn das Engagement-Hop-Limit überschritten wäre.
    const parentRunId =
        (event.type === "entity.created" || event.type === "entity.updated")
            ? (event as EntityEventPayload).sourcePlaybookRunId ?? null
            : null;

    const out = await playbookRunner.startRun({
        engagementId,
        playbookKey,
        rootEntityId,
        triggeredBy: `rule:${event.type}`,
        params: (params.paramsTemplate as Record<string, unknown>) ?? {},
        parentRunId,
    });
    if ("blocked" in out) {
        return {
            blocked: true,
            reason: out.reason,
            hopDepthRequested: out.hopDepthRequested,
            hopDepthLimit: out.hopDepthLimit,
            parentRunId: out.parentRunId,
            playbookKey,
        };
    }
    return { playbookRunId: out.runId, playbookKey, parentRunId };
}

async function actNotifyBoss(
    rule: Rule,
    params: Record<string, unknown>,
    event: SecuEvent,
    data: ConditionData,
): Promise<Record<string, unknown>> {
    const bossUrl = process.env.BOSS_API_URL;
    const bossKey = process.env.BOSS_API_KEY;
    if (!bossUrl) {
        return { skipped: true, reason: "BOSS_API_URL not configured" };
    }

    const severityFloor = String(params.severityFloor ?? "").toLowerCase();
    if (severityFloor && data.finding) {
        const order = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;
        const have = order[data.finding.severity as keyof typeof order] ?? 0;
        const need = order[severityFloor as keyof typeof order] ?? 0;
        if (have < need) return { skipped: true, reason: `severity ${data.finding.severity} below floor ${severityFloor}` };
    }

    const message = renderTemplate(
        typeof params.message === "string"
            ? params.message
            : `[secu rule] ${rule.name} fired on ${event.type}`,
        data,
    );

    const url = bossUrl.replace(/\/$/, "") + "/notifications";
    try {
        await axios.post(url, {
            text: message,
            channel: params.channel ?? "alerts",
            source: "node-secu",
            event,
        }, {
            headers: {
                "x-app-id": "node-secu",
                "x-api-key": bossKey ?? "",
                "Content-Type": "application/json",
            },
            timeout: 5_000,
        });
        return { sent: true, message };
    } catch (err) {
        // Boss kann offline sein — wir loggen und reichen den Fehler weiter,
        // damit der Audit-Log success=false markiert. Andere Rules laufen
        // weiter (siehe processEvent).
        throw new Error(`notify_boss failed: ${(err as Error).message}`);
    }
}

async function actCreateFinding(
    params: Record<string, unknown>,
    event: SecuEvent,
    data: ConditionData,
): Promise<Record<string, unknown>> {
    const engagementId = data.engagement?.id ?? resolveEngagementId(event);
    if (!engagementId) throw new Error("create_finding: no engagement in scope");

    const severity = String(params.severity ?? "low") as "info" | "low" | "medium" | "high" | "critical";
    const category = String(params.category ?? "config") as
        | "dns" | "email_security" | "tls" | "http_headers" | "exposure" | "cms"
        | "auth" | "injection" | "cve" | "config" | "deps" | "cert" | "phishing" | "leak";
    const title = String(params.title ?? "Rule-generated finding").slice(0, 256);
    const description = renderTemplate(String(params.descriptionTemplate ?? title), data);
    const recommendation = typeof params.recommendation === "string" ? params.recommendation : undefined;

    const entityId = resolveEntityId(params.entityIdFrom ?? "entity.id", event, data) ?? null;
    const fingerprint = `rule:${title.toLowerCase()}:${entityId ?? "no_entity"}`;

    const out = await findingService.persistDraft({
        engagementId,
        entityId,
        workerRunId: null,
        draft: {
            fingerprintInputs: [fingerprint],
            severity,
            category,
            title,
            description,
            recommendation,
        },
    });
    return { findingId: out.finding.id, kind: out.kind };
}

function resolveEntityId(
    spec: unknown,
    event: SecuEvent,
    data: ConditionData,
): number | null {
    if (typeof spec === "number" && Number.isFinite(spec)) return spec;
    if (typeof spec !== "string" || !spec) {
        // Default-Resolution
        if (event.type === "entity.created" || event.type === "entity.updated") return event.entityId;
        if (data.entity) return data.entity.id;
        return null;
    }
    const path = spec.split(".");
    let node: unknown = data;
    for (const seg of path) {
        if (node && typeof node === "object" && seg in (node as object)) {
            node = (node as Record<string, unknown>)[seg];
        } else {
            return null;
        }
    }
    return typeof node === "number" ? node : Number.isFinite(Number(node)) ? Number(node) : null;
}

function resolveEngagementId(event: SecuEvent): number | null {
    if (event.type === "finding.created") return (event as FindingEventPayload).engagementId;
    if (event.type === "playbook_run.completed") return (event as PlaybookRunEventPayload).engagementId;
    return null;
}

/** Sehr einfache Template-Engine: ersetzt {{path.to.value}}. */
function renderTemplate(template: string, data: ConditionData): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
        const segs = path.split(".");
        let node: unknown = data;
        for (const s of segs) {
            if (node && typeof node === "object" && s in (node as object)) {
                node = (node as Record<string, unknown>)[s];
            } else {
                return "";
            }
        }
        if (node === undefined || node === null) return "";
        if (typeof node === "object") return JSON.stringify(node);
        return String(node);
    });
}

// Phase 2.7 — Engagement-Budget-Service.
//
// Pro Engagement ein in-memory Sliding-Window-Counter (1h Fenster, Default-Budget
// `engagements.osint_budget_per_hour=1000`). OSINT-Worker werden vom Runner vor
// dem Run gecheckt — bei exceeded → worker_run.status="skipped" mit
// error="engagement_osint_budget_exceeded".
//
// Damit Operator nicht stillschweigend ausgesperrt wird, feuert der Service
// pro Engagement maximal 1×/h einen `notify_boss`-Hint.

import { eq } from "drizzle-orm";
import axios from "axios";
import { database } from "@/db";
import { engagements } from "@/db/individual/individual-schema";
import type { WorkerJobKey } from "../workers/worker.types";

const WINDOW_MS = 60 * 60 * 1000;
const NOTIFY_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BUDGET = 1000;
const ENGAGEMENT_CACHE_TTL_MS = 60 * 1000;

interface BudgetState {
    windowStart: number;
    count: number;
    /** Wann zuletzt eine "budget exceeded"-Boss-Notify gefeuert wurde. */
    lastNotifyAt: number;
}

interface CachedBudget {
    budget: number;
    cachedAt: number;
}

const STATE = new Map<number, BudgetState>();
const BUDGET_CACHE = new Map<number, CachedBudget>();

const OSINT_PREFIX_MATCHES = [
    "osint_",
    "email_",
    "username_",
    "phone_",
    "social_account_",
    "domain_ct_",
    "domain_github_",
    "github_secret_",
    // Sprint 3 — GitHub-Brand-Discovery (siehe features.md §3.3 #29a-c).
    "github_repos_",
    "github_events_",
];

export function isOsintWorker(jobKey: WorkerJobKey | string): boolean {
    return OSINT_PREFIX_MATCHES.some((p) => jobKey.startsWith(p));
}

async function loadBudget(engagementId: number): Promise<number> {
    const cached = BUDGET_CACHE.get(engagementId);
    if (cached && Date.now() - cached.cachedAt < ENGAGEMENT_CACHE_TTL_MS) {
        return cached.budget;
    }
    const [row] = await database
        .select({ budget: engagements.osintBudgetPerHour })
        .from(engagements)
        .where(eq(engagements.id, engagementId))
        .limit(1);
    const budget = row?.budget ?? DEFAULT_BUDGET;
    BUDGET_CACHE.set(engagementId, { budget, cachedAt: Date.now() });
    return budget;
}

function getOrInitState(engagementId: number): BudgetState {
    const now = Date.now();
    let s = STATE.get(engagementId);
    if (!s) {
        s = { windowStart: now, count: 0, lastNotifyAt: 0 };
        STATE.set(engagementId, s);
    } else if (now - s.windowStart >= WINDOW_MS) {
        s.windowStart = now;
        s.count = 0;
    }
    return s;
}

export const engagementBudgetService = {
    async check(engagementId: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetInMs: number;
        budget: number;
        reason?: string;
    }> {
        const budget = await loadBudget(engagementId);
        const s = getOrInitState(engagementId);
        const resetInMs = Math.max(0, s.windowStart + WINDOW_MS - Date.now());
        if (s.count >= budget) {
            // Notify-Throttle: höchstens 1×/h pro Engagement.
            void maybeNotifyBoss(engagementId, budget, s);
            return { allowed: false, remaining: 0, resetInMs, budget, reason: "engagement_osint_budget_exceeded" };
        }
        return { allowed: true, remaining: budget - s.count, resetInMs, budget };
    },

    increment(engagementId: number, by = 1): void {
        const s = getOrInitState(engagementId);
        s.count += by;
    },

    /** Test-/Operator-Helper: Reset des Counters für ein Engagement. */
    reset(engagementId: number): void {
        STATE.delete(engagementId);
        BUDGET_CACHE.delete(engagementId);
    },

    /** Diagnose: aktueller Counter-Stand. */
    snapshot(engagementId: number): { count: number; windowStart: Date | null; budget: number | null } {
        const s = STATE.get(engagementId);
        const b = BUDGET_CACHE.get(engagementId);
        return {
            count: s?.count ?? 0,
            windowStart: s ? new Date(s.windowStart) : null,
            budget: b?.budget ?? null,
        };
    },
};

async function maybeNotifyBoss(engagementId: number, budget: number, state: BudgetState): Promise<void> {
    const now = Date.now();
    if (now - state.lastNotifyAt < NOTIFY_INTERVAL_MS) return;
    state.lastNotifyAt = now;

    const url = process.env.BOSS_API_URL;
    if (!url) return;
    try {
        await axios.post(url.replace(/\/$/, "") + "/notifications", {
            text: `🔇 [secu] OSINT-Budget für Engagement ${engagementId} ausgeschöpft (${budget}/h). Worker-Runs werden 1h lang skipped.`,
            channel: "alerts",
            source: "node-secu",
            event: { type: "osint.budget_exceeded", engagementId, budget },
        }, {
            headers: {
                "x-app-id": "node-secu",
                "x-api-key": process.env.BOSS_API_KEY ?? "",
                "Content-Type": "application/json",
            },
            timeout: 5_000,
        });
    } catch (err) {
        console.warn(`[engagement-budget] notify failed: ${(err as Error).message}`);
    }
}

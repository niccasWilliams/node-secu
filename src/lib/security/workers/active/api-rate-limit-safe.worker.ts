// API Rate-Limit Safe-Probe Worker — active_safe.
//
// Scope: active_safe.
// Begründung: schickt 30 GETs in 10 Sekunden auf einen einzelnen Endpoint, der
// idempotent und non-destructive ist (Default: /api/health). Das ist ein sehr
// niedriges Volume — RFC für ratelimit-Tests legt typische Floor bei 60 req/sec
// für 30s an. Wir sind 6× drunter, kein DoS-Risiko, aber genug um zu sehen ob
// überhaupt rate-limited wird.
//
// Output:
//   - findings:
//       * medium: "Kein Rate-Limit detected" (alle 30 Requests erfolgreich, kein 429,
//                  keine RateLimit-* Header)
//       * info:   "Rate-Limit aktiv: <triggered after N>" (positive Evidence — gut)
//
// WICHTIG: Wir testen NUR /api/health (oder ähnliche idempotente Endpoints).
// Niemals /api/login oder ein Auth-Endpoint — das wäre Auth-Brute-Risiko und
// gehört in active_intrusive.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

const PROBE_PATHS = [
    "/api/health",
    "/healthz",
    "/health",
    "/ping",
    "/api/ping",
    "/status",
];

const TOTAL_REQUESTS = 30;
const SPACING_MS = 333; // ~3 req/sec → ~10s gesamt; sehr safe

interface AttemptResult {
    ts: number;
    status: number;
    rateLimitRemaining?: string;
    retryAfter?: string;
}

export const apiRateLimitSafeWorker: SecurityWorker = {
    jobKey: "api_rate_limit_safe",
    requiredScope: "active_safe",
    description:
        "Schickt 30 GETs in ~10s auf einen idempotenten Endpoint (/api/health o.ä.) " +
        "und prüft, ob 429 zurückkommt oder RateLimit-Header gesetzt sind.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return (
            target.kind === "asset_domain" ||
            target.kind === "asset_subdomain" ||
            target.kind === "asset_url" ||
            target.kind === "asset_host"
        );
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const host = normalizeHost(ctx.target.value);
        const findings: FindingDraft[] = [];

        const probedPath = await pickProbablePath(host, ctx.timeoutMs);
        if (!probedPath) {
            return {
                success: true,
                rawOutput: { host, reason: "no_safe_idempotent_endpoint_found" },
                findings: [],
                durationMs: Date.now() - start,
            };
        }

        const attempts: AttemptResult[] = [];
        for (let i = 0; i < TOTAL_REQUESTS; i++) {
            if (ctx.abortSignal?.aborted) break;
            const a = await singleProbe(host, probedPath, ctx.timeoutMs);
            if (a) attempts.push(a);
            if (a?.status === 429) break;
            await sleep(SPACING_MS);
        }

        const blocked = attempts.find((a) => a.status === 429);
        const sawRateLimitHeaders = attempts.some(
            (a) => a.rateLimitRemaining !== undefined || a.retryAfter !== undefined,
        );

        if (blocked) {
            findings.push({
                fingerprintInputs: ["api_rate_limit", host, "blocked", probedPath],
                severity: "info",
                category: "config",
                title: `Rate-Limit aktiv: 429 nach ${attempts.indexOf(blocked) + 1} Requests`,
                description:
                    `Endpoint ${probedPath} wurde nach ${attempts.indexOf(blocked) + 1} Requests von ${TOTAL_REQUESTS} ` +
                    "mit 429 Too Many Requests beantwortet — Rate-Limiting funktioniert.",
                evidence: { triggeredAfter: attempts.indexOf(blocked) + 1, retryAfter: blocked.retryAfter },
            });
        } else if (!sawRateLimitHeaders) {
            findings.push({
                fingerprintInputs: ["api_rate_limit", host, "missing", probedPath],
                severity: "medium",
                category: "config",
                title: "Kein API-Rate-Limit detected",
                description:
                    `Auf ${probedPath} wurden ${attempts.length} aufeinanderfolgende Requests in ~${SPACING_MS * attempts.length / 1000}s ` +
                    "akzeptiert, ohne 429 oder RateLimit-Remaining-Header zurückzubekommen. Brute-Force / DoS auf " +
                    "öffentliche API-Endpoints ist damit unbegrenzt möglich.",
                recommendation:
                    "Edge-/App-Layer Rate-Limiting einführen (Cloudflare-Rule, nginx limit_req, app-level Token-Bucket). " +
                    "Mindestens RateLimit-Header gemäß RFC 9239 setzen, damit Clients sich anpassen können.",
                evidence: { probedPath, totalRequests: attempts.length, allStatuses: dedupeStatuses(attempts) },
            });
        } else {
            findings.push({
                fingerprintInputs: ["api_rate_limit", host, "headers_only", probedPath],
                severity: "info",
                category: "config",
                title: "Rate-Limit-Header gesetzt, aber 429 nicht ausgelöst",
                description:
                    `Server setzt RateLimit-Header (gut), aber 30 Requests in ~10s lösten kein 429 aus — Limit liegt höher.`,
                evidence: { probedPath, attempts: attempts.length },
            });
        }

        return {
            success: true,
            rawOutput: { host, probedPath, attempts },
            findings,
            durationMs: Date.now() - start,
        };
    },
};

function normalizeHost(input: string): string {
    let v = input.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) {
        try { v = new URL(v).hostname; } catch { /* keep raw */ }
    }
    if (v.endsWith(".")) v = v.slice(0, -1);
    return v;
}

async function pickProbablePath(host: string, timeoutMs: number): Promise<string | null> {
    for (const path of PROBE_PATHS) {
        const url = `https://${host}${path}`;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5_000));
            const res = await fetch(url, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
                headers: { "User-Agent": "node-secu/0.1 (+active-safe-scan)" },
            });
            clearTimeout(timer);
            // Wir akzeptieren 200 oder 204 als "Endpoint existiert und antwortet günstig".
            if (res.status === 200 || res.status === 204) return path;
        } catch { /* try next */ }
    }
    return null;
}

async function singleProbe(host: string, path: string, timeoutMs: number): Promise<AttemptResult | null> {
    const url = `https://${host}${path}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5_000));
        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: { "User-Agent": "node-secu/0.1 (+active-safe-scan)" },
        });
        clearTimeout(timer);
        return {
            ts: Date.now(),
            status: res.status,
            rateLimitRemaining:
                res.headers.get("ratelimit-remaining") ??
                res.headers.get("x-ratelimit-remaining") ??
                undefined,
            retryAfter: res.headers.get("retry-after") ?? undefined,
        };
    } catch {
        return null;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function dedupeStatuses(attempts: AttemptResult[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const a of attempts) out[String(a.status)] = (out[String(a.status)] ?? 0) + 1;
    return out;
}

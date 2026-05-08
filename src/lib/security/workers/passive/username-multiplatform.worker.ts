// Phase 2.7 — username_multiplatform Worker.
//
// Input:  username-Entity
// Output: pro Plattform mit Hit ein social_account-Draft (platform=<name>, handle=username)
//         + Sammel-Finding (severity=info, category=exposure).
//
// Quelle: data/osint/username-platforms.json — kuratierte Liste mit qualityTier:
//   - "verified"  → strikt validiert (statusCode AND content-match), Default-Tier
//   - "candidate" → opt-in pro Engagement (env USERNAME_PLATFORM_TIER=both),
//                   höherer False-Positive-Anteil, niedrigere Confidence
//
// Salat-Schutz:
//   - successCriteria erfordert IMMER explizite Bestätigung — kein "default true"
//   - 200-mit-leerer-Liste-Pattern (api.stackexchange, hackernews, duolingo) korrekt
//     als errorCriteria modelliert
//   - candidate-Tier defaultmäßig deaktiviert
//
// Pflicht: OSINT_HTTP_PROXY (Provider-Config setzt requiresProxy=true für whatsmyname-/uplat-).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AxiosResponse } from "axios";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";
import { osintHttp } from "../../osint/osint-http";

interface PlatformEntry {
    name: string;
    platform: string;
    method: "GET" | "POST";
    url: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown> | string;
    successCriteria?: {
        statusCodeIn?: number[];
        responseContains?: string;
        responseRegex?: string;
    };
    errorCriteria?: {
        statusCodeIn?: number[];
        responseContains?: string;
        responseRegex?: string;
    };
    qualityTier: "verified" | "candidate";
    complianceTag?: string;
}

interface PlatformsConfig {
    version: number;
    source: string;
    lastReviewed: string;
    platforms: PlatformEntry[];
}

let cached: PlatformsConfig | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadConfig(): Promise<PlatformsConfig> {
    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
    const p = path.resolve(process.cwd(), "data/osint/username-platforms.json");
    const raw = await fs.readFile(p, "utf-8");
    cached = JSON.parse(raw) as PlatformsConfig;
    cachedAt = Date.now();
    return cached;
}

function activeTiers(): Array<"verified" | "candidate"> {
    const env = process.env.USERNAME_PLATFORM_TIER?.toLowerCase();
    if (env === "both" || env === "all" || env === "candidate+verified") return ["verified", "candidate"];
    if (env === "candidate") return ["candidate"]; // selten gewollt, aber explizit
    return ["verified"];
}

function renderTemplate(s: string, vars: Record<string, string>): string {
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function renderBody(body: PlatformEntry["body"], vars: Record<string, string>): unknown {
    if (body == null) return undefined;
    if (typeof body === "string") return renderTemplate(body, vars);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (typeof v === "string") out[k] = renderTemplate(v, vars);
        else out[k] = v;
    }
    return out;
}

type Verdict = "hit" | "no_hit" | "rate_limited" | "error" | "inconclusive";

function evaluate(res: AxiosResponse, p: PlatformEntry): Verdict {
    const status = res.status;
    if (status === 429 || status === 503) return "rate_limited";
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");

    if (p.errorCriteria) {
        const ec = p.errorCriteria;
        const statusErr = ec.statusCodeIn?.includes(status) ?? false;
        const containsErr = ec.responseContains ? body.includes(ec.responseContains) : false;
        const regexErr = ec.responseRegex ? new RegExp(ec.responseRegex).test(body) : false;
        if (statusErr || containsErr || regexErr) return "no_hit";
    }
    if (p.successCriteria) {
        const sc = p.successCriteria;
        const statusOk = sc.statusCodeIn === undefined || sc.statusCodeIn.includes(status);
        const containsOk = sc.responseContains === undefined || body.includes(sc.responseContains);
        const regexOk = sc.responseRegex === undefined || new RegExp(sc.responseRegex).test(body);
        if (statusOk && containsOk && regexOk) return "hit";
    }
    if (status >= 500) return "error";
    return "inconclusive";
}

export const usernameMultiplatformWorker: SecurityWorker = {
    jobKey: "username_multiplatform",
    requiredScope: "passive_only",
    description: "Prüft kuratierte Plattformen (WhatsMyName-Tier verified, Sherlock/Maigret-Tier candidate) auf Existenz eines Profils mit dem Username. Erfordert OSINT_HTTP_PROXY.",
    defaultTimeoutMs: 180_000,

    isApplicable(target) {
        return target.kind === "username";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const username = ctx.target.value.trim();
        const vars = { username, username_lower: username.toLowerCase() };

        let config: PlatformsConfig;
        try {
            config = await loadConfig();
        } catch (err) {
            return {
                success: false,
                findings: [],
                error: `username_platforms_load_failed:${(err as Error).message}`,
                durationMs: Date.now() - start,
            };
        }

        const tiers = new Set(activeTiers());
        const platforms = config.platforms.filter((p) => tiers.has(p.qualityTier));
        if (platforms.length === 0) {
            return {
                success: true,
                findings: [],
                error: "username_no_platforms_selected",
                durationMs: Date.now() - start,
            };
        }

        const discovered: DiscoveredEntityDraft[] = [];
        const stats = { hits: [] as Array<{ name: string; platform: string; tier: string }>, noHits: 0, inconclusive: 0, skipped: 0, errors: 0, rateLimited: 0 };

        for (const p of platforms) {
            if (ctx.abortSignal?.aborted) break;
            const providerKey = p.qualityTier === "verified" ? `whatsmyname-${p.name}` : `uplat-candidate-${p.name}`;
            const gate = osintHttp.gate(providerKey);
            if (gate.skipped) {
                stats.skipped++;
                continue;
            }
            const release = await acquireProvider(providerKey, { abortSignal: ctx.abortSignal });
            try {
                const url = renderTemplate(p.url, vars);
                const data = renderBody(p.body, vars);
                const res = await gate.client.request({
                    method: p.method,
                    url,
                    data,
                    headers: p.headers,
                    timeout: 10_000,
                    signal: ctx.abortSignal,
                    validateStatus: () => true,
                });
                const v = evaluate(res, p);
                if (v === "rate_limited") {
                    await markProvider429(providerKey, `${p.name} ${res.status}`);
                    stats.rateLimited++;
                    continue;
                }
                if (v === "error") {
                    stats.errors++;
                    continue;
                }
                if (v === "no_hit") {
                    markProviderSuccess(providerKey);
                    stats.noHits++;
                    continue;
                }
                if (v === "inconclusive") {
                    markProviderSuccess(providerKey);
                    stats.inconclusive++;
                    continue;
                }
                // hit
                markProviderSuccess(providerKey);
                stats.hits.push({ name: p.name, platform: p.platform, tier: p.qualityTier });
                discovered.push({
                    kind: "social_account",
                    primaryValue: username,
                    discriminator: p.platform,
                    displayName: `${p.platform}:${username}`,
                    data: {
                        platform: p.platform,
                        handle: username,
                        profileUrl: renderTemplate(p.url, vars),
                        verified: p.qualityTier === "verified",
                        discoveredVia: "username_multiplatform",
                        qualityTier: p.qualityTier,
                        complianceTag: p.complianceTag,
                    },
                    relationshipToRoot: {
                        kind: "owns_social_account",
                        direction: "from_root_to_discovered",
                        confidence: p.qualityTier === "verified" ? 85 : 60,
                    },
                    source: `osint_username_${p.qualityTier}_${p.name}`,
                });
            } catch (err: unknown) {
                const e = err as { response?: { status?: number }; message?: string; code?: string };
                if (e.response?.status === 429 || e.response?.status === 403) {
                    await markProvider429(providerKey, `${p.name} ${e.message}`);
                    stats.rateLimited++;
                } else {
                    stats.errors++;
                }
            } finally {
                release();
            }
        }

        const findings: FindingDraft[] = [];
        if (stats.hits.length > 0) {
            const verifiedHits = stats.hits.filter((h) => h.tier === "verified").map((h) => h.platform);
            const candidateHits = stats.hits.filter((h) => h.tier === "candidate").map((h) => h.platform);
            findings.push({
                fingerprintInputs: ["osint_username_multiplatform", username, stats.hits.map((h) => h.name).sort().join(",")],
                severity: "info",
                category: "exposure",
                title: `${stats.hits.length} Plattform-Profile für Username "${username}"`,
                description: `Über kuratierte Plattform-DB wurden Profile mit dem Username "${username}" identifiziert.\n\nVerified-Tier (hohe Confidence): ${verifiedHits.join(", ") || "—"}\nCandidate-Tier (manuell verifizieren): ${candidateHits.join(", ") || "—"}`,
                evidence: {
                    username,
                    hits: stats.hits,
                    platformsChecked: platforms.length,
                    inconclusive: stats.inconclusive,
                    rateLimited: stats.rateLimited,
                    skipped: stats.skipped,
                },
            });
        }

        return {
            success: true,
            rawOutput: { username, ...stats, platformsChecked: platforms.length, proxied: osintHttp.isProxied() },
            findings,
            discoveredEntities: discovered,
            durationMs: Date.now() - start,
        };
    },
};

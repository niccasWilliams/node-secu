// Phase 2.7 — email_holehe_passive Worker.
//
// Input:  email_address-Entity
// Output: Pro Plattform mit Hit ein social_account-Draft (platform=<name>, handle=email)
//         + ein Finding (severity=info, category=exposure).
//
// Quelle: data/osint/holehe-modules.json — kuratierte ToS-konforme Holehe-Module.
//         Pro Modul: name, platform, method, url, optional headers/body, success-/error-
//         Criteria. Der Worker rendert {email}/{email_local}/{md5_email}-Platzhalter
//         in URL und Body.
//
// Operator-Steuerung:
//   - HOLEHE_MODULES_ONLY="adobe,github,spotify"   → Whitelist, andere übersprungen
//   - HOLEHE_MODULES_DISABLED="instagram,linkedin-public" → einzelne deaktivieren
//   - OSINT_HTTP_PROXY                              → Pflicht (provider-config.requiresProxy=true)
//
// Schutznetz: Wenn kein Proxy konfiguriert ist, gibt jeder Modul-Versuch
// `provider_requires_proxy_unconfigured:holehe-<name>` zurück und wird übersprungen,
// statt Home-IP zu verbrennen. Der Worker selbst läuft mit success=true und
// loggt das als skipped-Reason.

import crypto from "node:crypto";
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

interface HoleheModule {
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
    };
    complianceNote?: string;
}

interface HoleheConfig {
    version: number;
    source: string;
    lastReviewed: string;
    modules: HoleheModule[];
}

let cachedConfig: HoleheConfig | null = null;
let cachedAt = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000;

async function loadConfig(): Promise<HoleheConfig> {
    if (cachedConfig && Date.now() - cachedAt < CONFIG_TTL_MS) return cachedConfig;
    // data/osint/holehe-modules.json relativ zum repo-root.
    const configPath = path.resolve(process.cwd(), "data/osint/holehe-modules.json");
    const raw = await fs.readFile(configPath, "utf-8");
    cachedConfig = JSON.parse(raw) as HoleheConfig;
    cachedAt = Date.now();
    return cachedConfig;
}

function selectModules(all: HoleheModule[]): HoleheModule[] {
    const only = process.env.HOLEHE_MODULES_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
    const disabled = new Set(
        process.env.HOLEHE_MODULES_DISABLED?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
    );
    let modules = all;
    if (only && only.length > 0) {
        const allow = new Set(only);
        modules = modules.filter((m) => allow.has(m.name));
    }
    if (disabled.size > 0) {
        modules = modules.filter((m) => !disabled.has(m.name));
    }
    return modules;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

function renderBody(
    body: HoleheModule["body"],
    vars: Record<string, string>,
): unknown {
    if (body == null) return undefined;
    if (typeof body === "string") return renderTemplate(body, vars);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (typeof v === "string") out[k] = renderTemplate(v, vars);
        else if (v && typeof v === "object") out[k] = renderBody(v as HoleheModule["body"], vars);
        else out[k] = v;
    }
    return out;
}

type ModuleVerdict = "hit" | "no_hit" | "inconclusive" | "rate_limited" | "error";

function verdict(res: AxiosResponse, mod: HoleheModule): ModuleVerdict {
    const status = res.status;
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");

    if (status === 429 || status === 503) return "rate_limited";

    if (mod.errorCriteria?.statusCodeIn?.includes(status)) return "no_hit";

    if (mod.successCriteria) {
        const sc = mod.successCriteria;
        const statusOk = sc.statusCodeIn === undefined || sc.statusCodeIn.includes(status);
        const containsOk = sc.responseContains === undefined || body.includes(sc.responseContains);
        const regexOk = sc.responseRegex === undefined || new RegExp(sc.responseRegex).test(body);
        if (statusOk && containsOk && regexOk) return "hit";
    }
    if (status >= 500) return "error";
    return "inconclusive";
}

export const emailHolehePassiveWorker: SecurityWorker = {
    jobKey: "email_holehe_passive",
    requiredScope: "passive_only",
    description: "Prüft kuratierte ToS-konforme Plattformen auf Existenz eines Accounts mit dieser Email — über öffentliche Sign-up-/Forgot-Password-Validation-Endpoints. Erfordert OSINT_HTTP_PROXY.",
    defaultTimeoutMs: 120_000,

    isApplicable(target) {
        return target.kind === "email_address";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const email = ctx.target.value.trim().toLowerCase();
        const emailLocal = email.split("@")[0] ?? email;
        const md5Email = crypto.createHash("md5").update(email).digest("hex");
        const vars = { email, email_local: emailLocal, md5_email: md5Email };

        let config: HoleheConfig;
        try {
            config = await loadConfig();
        } catch (err) {
            return {
                success: false,
                findings: [],
                error: `holehe_config_load_failed:${(err as Error).message}`,
                durationMs: Date.now() - start,
            };
        }

        const modules = selectModules(config.modules);
        if (modules.length === 0) {
            return {
                success: true,
                findings: [],
                error: "holehe_no_modules_selected",
                durationMs: Date.now() - start,
            };
        }

        const discovered: DiscoveredEntityDraft[] = [];
        const findings: FindingDraft[] = [];
        const stats = { hits: [] as string[], noHits: [] as string[], inconclusive: [] as string[], skipped: [] as string[], errors: [] as string[] };

        for (const mod of modules) {
            if (ctx.abortSignal?.aborted) break;
            const providerKey = `holehe-${mod.name}`;
            const gate = osintHttp.gate(providerKey);
            if (gate.skipped) {
                stats.skipped.push(`${mod.name}:${gate.reason ?? "skipped"}`);
                continue;
            }

            const release = await acquireProvider(providerKey, { abortSignal: ctx.abortSignal });
            try {
                const url = renderTemplate(mod.url, vars);
                const data = renderBody(mod.body, vars);
                const res = await gate.client.request({
                    method: mod.method,
                    url,
                    data,
                    headers: mod.headers,
                    timeout: 10_000,
                    signal: ctx.abortSignal,
                    validateStatus: () => true,
                });

                const v = verdict(res, mod);
                if (v === "rate_limited") {
                    await markProvider429(providerKey, `holehe ${mod.name} ${res.status}`);
                    stats.skipped.push(`${mod.name}:rate_limited_${res.status}`);
                    continue;
                }
                if (v === "error") {
                    stats.errors.push(`${mod.name}:status_${res.status}`);
                    continue;
                }
                if (v === "no_hit") {
                    markProviderSuccess(providerKey);
                    stats.noHits.push(mod.name);
                    continue;
                }
                if (v === "inconclusive") {
                    markProviderSuccess(providerKey);
                    stats.inconclusive.push(mod.name);
                    continue;
                }

                // v === "hit"
                markProviderSuccess(providerKey);
                stats.hits.push(mod.name);
                discovered.push({
                    kind: "social_account",
                    primaryValue: email,
                    discriminator: mod.platform,
                    displayName: `${mod.platform}:${email}`,
                    data: {
                        platform: mod.platform,
                        handle: email,
                        verified: false,
                        discoveredVia: "holehe_passive",
                        moduleName: mod.name,
                    },
                    relationshipToRoot: {
                        kind: "owns_social_account",
                        direction: "from_root_to_discovered",
                        confidence: 75,
                    },
                    source: `osint_holehe_${mod.name}`,
                });
                findings.push({
                    fingerprintInputs: ["osint_holehe", mod.name, email],
                    severity: "info",
                    category: "exposure",
                    title: `Account auf ${mod.platform} mit ${email}`,
                    description: `Holehe-Modul ${mod.name} bestätigt: für die Email ${email} existiert ein Account auf ${mod.platform}.`,
                    evidence: {
                        platform: mod.platform,
                        moduleName: mod.name,
                        complianceNote: mod.complianceNote ?? null,
                    },
                });
            } catch (err: unknown) {
                const e = err as { response?: { status?: number }; message?: string; code?: string };
                if (e.response?.status === 429 || e.response?.status === 403) {
                    await markProvider429(providerKey, `holehe ${mod.name} ${e.message}`);
                    stats.skipped.push(`${mod.name}:rate_limited_or_blocked`);
                } else {
                    stats.errors.push(`${mod.name}:${e.code ?? e.message ?? "unknown"}`);
                }
            } finally {
                release();
            }
        }

        if (stats.hits.length > 0) {
            findings.unshift({
                fingerprintInputs: ["osint_holehe", "summary", email, stats.hits.sort().join(",")],
                severity: "info",
                category: "exposure",
                title: `${stats.hits.length} Plattform-Accounts mit ${email} entdeckt (Holehe)`,
                description: `Über kuratierte Holehe-Module wurden Accounts mit dieser Email auf folgenden Plattformen bestätigt: ${stats.hits.join(", ")}.`,
                evidence: { platforms: stats.hits, modulesChecked: modules.length, inconclusive: stats.inconclusive.length, skipped: stats.skipped.length },
            });
        }

        return {
            success: true,
            rawOutput: { modulesChecked: modules.length, ...stats, proxied: osintHttp.isProxied() },
            findings,
            discoveredEntities: discovered,
            durationMs: Date.now() - start,
        };
    },
};

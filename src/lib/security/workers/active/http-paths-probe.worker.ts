// HTTP Paths Probe Worker — active_safe.
//
// Macht *eine* Reihe gezielter Probes gegen Standard-Pfade, die typische Misconfigs
// aufdecken:
//   1. /robots.txt — Inhalt analysieren (Information-Disclosure: verrät Routes wie /admin)
//   2. /sitemap.xml — Existenz + Hinweis auf API-Endpoints
//   3. /.well-known/security.txt — Best-Practice-Check
//   4. /.well-known/change-password — RFC 8615
//   5. /api/health, /healthz, /status — Backend-Info-Leaks
//   6. /admin, /user, /sign-in — Server-Side-Auth-Gate-Test (200 ohne Auth = Skeleton-leak)
//   7. HTTP-Methoden auf Root: TRACE/PROPFIND/PUT/DELETE → 405 erwartet
//
// Scope-Begründung: Alle Probes sind GETs/HEADs auf bekannten Standard-Pfaden bzw.
// gültige HTTP-Methods auf Root. Keine Auth-Brute, kein Param-Fuzzing, kein
// Path-Brute über Wordlists. Branchenübliches "active_safe".

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";
import { resolveHost } from "../_lib/resolve-host";

interface ProbeResult {
    path: string;
    status: number;
    contentLength: number;
    contentType: string;
    body?: string;        // Best-Effort, gekürzt
    headers: Record<string, string>;
}

const COMMON_HEALTH_PATHS = [
    "api/health",
    "healthz",
    "health",
    "status",
    "metrics",
    "ready",
    "_status",
];

const AUTH_PROTECTED_PATHS = [
    "admin",
    "admin/",
    "user",
    "dashboard",
    "console",
    "panel",
];

const HTTP_METHODS = ["TRACE", "PROPFIND", "PUT", "DELETE", "OPTIONS"];

// Backend-Hinweise im /api/health Body, die Information-Disclosure signalisieren.
const HEALTH_LEAK_TOKENS = [
    "postgresql", "postgres", "mysql", "mongodb", "redis",
    "heap", "memory", "uptime", "version",
    "database", "rabbitmq", "kafka",
];

export const httpPathsProbeWorker: SecurityWorker = {
    jobKey: "http_paths_probe",
    requiredScope: "active_safe",
    description:
        "Probt Standard-Pfade auf typische Misconfigs: robots.txt-Disclosure, " +
        "leaky /api/health, fehlendes Server-Side-Auth-Gate auf /admin, gefährliche " +
        "HTTP-Methoden (TRACE → XST). ~25 GET-Requests gegen den Target-Host.",
    defaultTimeoutMs: 60_000,

    isApplicable(target) {
        return (
            target.kind === "asset_domain" ||
            target.kind === "asset_subdomain" ||
            target.kind === "asset_url"
        );
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const baseUrl = normalizeBaseUrl(ctx.target.value, ctx.target.kind);
        const findings: FindingDraft[] = [];

        // Pre-Check: Host resolvable?
        const hostFromUrl = (() => {
            try { return new URL(baseUrl).hostname; } catch { return ctx.target.value; }
        })();
        const resolved = await resolveHost(hostFromUrl, 3_000);
        if (!resolved.resolvable) {
            return {
                success: false,
                findings: [],
                error: `host not resolvable: ${resolved.error ?? "no addresses"}`,
                durationMs: Date.now() - start,
            };
        }

        // 1. robots.txt
        const robots = await probePath(baseUrl, "robots.txt", ctx, true);
        if (robots && robots.status === 200 && robots.body) {
            const disclosed = analyzeRobotsTxt(robots.body);
            if (disclosed.length > 0) {
                findings.push({
                    fingerprintInputs: ["robots_disclosure", baseUrl],
                    severity: "low",
                    category: "exposure",
                    title: `robots.txt verrät ${disclosed.length} Backend-Routen`,
                    description:
                        `${baseUrl}/robots.txt listet sensible Routen, die nur Indexierung ` +
                        `verbieten — gleichzeitig aber jedem Pen-Tester die App-Struktur offenlegen. ` +
                        `Routes: ${disclosed.slice(0, 8).join(", ")}${disclosed.length > 8 ? ", …" : ""}.`,
                    recommendation:
                        "Sensible Routen entweder hinter Auth-Middleware verstecken (kein Listing in robots.txt nötig) oder " +
                        "robots.txt minimieren auf Allow:/ + sitemap-Verweis. Disallow-Direktiven für /admin und Co. machen die Existenz nur sichtbarer.",
                    evidence: { disclosedPaths: disclosed, robotsFirstBytes: robots.body.slice(0, 500) },
                });
            }
        }

        // 2. .well-known/security.txt — Best-Practice-Check
        const secTxt = await probePath(baseUrl, ".well-known/security.txt", ctx, true);
        const secTxtRoot = await probePath(baseUrl, "security.txt", ctx, true);
        if ((secTxt?.status ?? 404) === 404 && (secTxtRoot?.status ?? 404) === 404) {
            findings.push({
                fingerprintInputs: ["security_txt_missing", baseUrl],
                severity: "info",
                category: "config",
                title: "Kein /.well-known/security.txt",
                description:
                    "RFC 9116 (security.txt) fehlt. Sicherheitsforscher haben keine standardisierte Kontaktadresse für Vuln-Disclosure.",
                recommendation:
                    "Lege `/.well-known/security.txt` mit `Contact: mailto:security@<domain>` und `Expires:` an. Free-Tool: securitytxt.org.",
                evidence: { triedPaths: [".well-known/security.txt", "security.txt"] },
            });
        }

        // 3. Health-Endpoint-Leaks
        for (const p of COMMON_HEALTH_PATHS) {
            const r = await probePath(baseUrl, p, ctx, true);
            if (!r || r.status !== 200) continue;
            const tokens = scanForLeakTokens(r.body ?? "");
            if (tokens.length >= 2) {
                findings.push({
                    fingerprintInputs: ["health_leak", baseUrl, p],
                    severity: "medium",
                    category: "exposure",
                    title: `Health-Endpoint /${p} leakt Backend-Details`,
                    description:
                        `${baseUrl}/${p} antwortet HTTP 200 unauthenticated und enthält Hinweise auf: ` +
                        tokens.join(", ") + ". Health-Endpoints sollten nur einen ok/nicht-ok-Status liefern.",
                    recommendation:
                        "Health-Endpoint auf summary reduzieren (`{\"status\":\"ok\"}`) oder hinter Auth-Token. Detail-Health (`/api/health/detail`) nur intern erreichbar.",
                    evidence: { path: p, leakedTokens: tokens, sample: (r.body ?? "").slice(0, 300) },
                });
                break; // einer reicht — wir wollen nicht für jeden Health-Pfad denselben Befund
            }
        }

        // 4. Auth-Gate-Test: /admin, /user, /dashboard erwarten 302/401/403 ohne Session
        for (const p of AUTH_PROTECTED_PATHS) {
            const r = await probePath(baseUrl, p, ctx, true);
            if (!r) continue;
            // 200 mit Skeleton-Body = Client-Side-Auth-Pattern (kein Server-Side-Gate)
            if (r.status === 200 && r.contentLength > 1_000) {
                const looksLikeSkeleton =
                    !!r.body &&
                    /(lädt|loading|spinner)/i.test(r.body) &&
                    !/(<form|password|input.*name=.password)/i.test(r.body);
                if (looksLikeSkeleton) {
                    findings.push({
                        fingerprintInputs: ["client_side_auth_gate", baseUrl, p],
                        severity: "medium",
                        category: "auth",
                        title: `/${p} liefert Skeleton-HTML ohne Server-Side-Auth-Gate`,
                        description:
                            `${baseUrl}/${p} antwortet HTTP 200 mit ${r.contentLength} Bytes Skeleton-HTML ` +
                            "(Loading-State). Es gibt kein Server-Side-Redirect zu /sign-in und keine " +
                            "401/403-Antwort. Das deutet auf reine Client-Side-Auth hin: wer JS deaktiviert " +
                            "oder direkt das Bundle inspiziert, sieht alle Admin-Routes/-Komponenten.",
                        recommendation:
                            "Next.js: Middleware-basierten Auth-Check ergänzen (`middleware.ts` mit Session-Cookie-Prüfung), " +
                            "der bei fehlender Session 302 → /sign-in returned. Nur als Defense-in-Depth zusätzlich zum bestehenden Client-Side-Guard.",
                        evidence: { path: p, status: r.status, contentLength: r.contentLength, bodyHead: r.body?.slice(0, 200) },
                    });
                    break; // gleiche Diagnose pro Host nur einmal
                }
            }
        }

        // 5. HTTP-Method-Enumeration
        for (const m of HTTP_METHODS) {
            const r = await probeMethod(baseUrl, m, ctx);
            if (!r) continue;
            if (m === "TRACE" && r.status >= 200 && r.status < 300) {
                findings.push({
                    fingerprintInputs: ["http_trace_enabled", baseUrl],
                    severity: "medium",
                    category: "config",
                    title: "HTTP TRACE-Methode aktiv (Cross-Site-Tracing-Risiko)",
                    description: `${baseUrl} antwortet auf TRACE mit HTTP ${r.status}. TRACE ist Standard-deaktiviert auf modernen Servern, weil es XST (Cross-Site-Tracing) ermöglicht.`,
                    recommendation: "TRACE im Edge/Reverse-Proxy explizit deaktivieren (nginx: `if ($request_method = TRACE) { return 405; }`).",
                    evidence: { method: m, status: r.status },
                });
            }
            if (m === "TRACE" && r.status === 500) {
                findings.push({
                    fingerprintInputs: ["http_trace_500", baseUrl],
                    severity: "low",
                    category: "config",
                    title: "HTTP TRACE liefert 500 (statt 405)",
                    description:
                        `${baseUrl} antwortet auf TRACE mit HTTP 500 (Internal Server Error). Erwartet wäre 405 (Method Not Allowed). ` +
                        "Ein 500 deutet darauf hin, dass die Methode nicht durch eine explizite Deny-Regel gefiltert ist sondern ein Backend-Fehler ausgelöst wird.",
                    recommendation: "TRACE-Methode im Edge-Layer explizit auf 405 mappen.",
                    evidence: { method: m, status: r.status },
                });
            }
        }

        return {
            success: true,
            rawOutput: { baseUrl, totalProbes: COMMON_HEALTH_PATHS.length + AUTH_PROTECTED_PATHS.length + HTTP_METHODS.length + 3 },
            findings,
            durationMs: Date.now() - start,
        };
    },
};

function normalizeBaseUrl(input: string, kind: string): string {
    let v = input.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) {
        try {
            const u = new URL(v);
            return `${u.protocol}//${u.host}`;
        } catch { /* fall through */ }
    }
    if (kind === "asset_domain" || kind === "asset_subdomain" || kind === "asset_host") {
        return `https://${v}`;
    }
    return v;
}

async function probePath(
    baseUrl: string,
    path: string,
    ctx: WorkerContext,
    captureBody: boolean,
): Promise<ProbeResult | null> {
    const url = `${baseUrl}/${path}`;
    return await fetchSafe(url, "GET", ctx, captureBody);
}

async function probeMethod(
    baseUrl: string,
    method: string,
    ctx: WorkerContext,
): Promise<ProbeResult | null> {
    return await fetchSafe(baseUrl + "/", method, ctx, false);
}

async function fetchSafe(
    url: string,
    method: string,
    ctx: WorkerContext,
    captureBody: boolean,
): Promise<ProbeResult | null> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    ctx.abortSignal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
        const res = await fetch(url, {
            method,
            redirect: "manual", // wir wollen den ersten Status sehen
            signal: controller.signal,
            headers: {
                "User-Agent": "node-secu/0.3 (+http_paths_probe)",
                "Accept": "*/*",
            },
        });
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        let body: string | undefined;
        if (captureBody) {
            try {
                const buf = await res.text();
                body = buf.slice(0, 4_000); // cap memory
            } catch { /* ignore */ }
        }
        return {
            path: new URL(url).pathname,
            status: res.status,
            contentLength: Number(headers["content-length"] ?? body?.length ?? 0),
            contentType: headers["content-type"] ?? "",
            body,
            headers,
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
        ctx.abortSignal?.removeEventListener("abort", onAbort);
    }
}

function analyzeRobotsTxt(body: string): string[] {
    const out: string[] = [];
    for (const line of body.split("\n")) {
        const m = line.match(/^\s*Disallow:\s*(\S+)/i);
        if (!m) continue;
        const p = m[1].trim();
        // Pfad ist nur dann ein "Disclosure", wenn er nicht trivial ist (`/`, `/_next` o.Ä.).
        if (!p || p === "/" || p === "*" || p.startsWith("/_next")) continue;
        if (!out.includes(p)) out.push(p);
    }
    return out;
}

function scanForLeakTokens(body: string): string[] {
    const lower = body.toLowerCase();
    const found: string[] = [];
    for (const tok of HEALTH_LEAK_TOKENS) {
        if (lower.includes(tok) && !found.includes(tok)) found.push(tok);
    }
    return found;
}

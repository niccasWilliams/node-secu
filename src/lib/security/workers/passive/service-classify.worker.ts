// Service-Classify-Worker — passive_only.
//
// Klassifiziert pro Host den Service-Type, damit der Report für den Customer
// klar liest ("Backend-API auf api.example.com gefunden") und damit die
// Rule-Engine darauf aufbauend gezielte Folge-Playbooks triggern kann
// (z.B. api_security_active bei serviceType="rest_api").
//
// Scope-Begründung: Wir machen nur EINEN HTTPS-HEAD und ein paar GETs auf
// öffentlich-konventionelle Pfade (/openapi.json, /swagger.json, /api-docs,
// /v3/api-docs, /robots.txt). Plus eine DNS-MX-Abfrage. Keine Auth, kein
// Path-Brute, kein Param-Fuzzing → passive_only ist korrekt. Das ist
// dieselbe Tier wie http_headers.
//
// Output-Kontract:
//   - entityDataPatch.serviceType = "webserver" | "rest_api" | "spa" |
//                                   "mailserver" | "tcp_only" | "unknown"
//   - entityDataPatch.serviceSignals = { ... } für Debugging/Report-Anhang
//   - 1 info-Finding mit dem klassifizierten Type
//   - falls rest_api & openapi-Doc gefunden: 1 info-Finding mit dem URL-Pfad
//
// Das Findings-Pattern ist info-Tier, weil "REST-API exposed" per se kein
// Befund ist — kritisch wird es nur, wenn die nachfolgende api_security_active-
// Pipeline darauf aufsetzt (Auth-Probe, CORS, Rate-Limit).

import dns from "node:dns/promises";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

type ServiceType =
    | "webserver"
    | "rest_api"
    | "spa"
    | "mailserver"
    | "tcp_only"
    | "dangling_platform"
    | "unknown";

interface ProbeSummary {
    httpsReachable: boolean;
    httpStatus?: number;
    contentType?: string;
    serverHeader?: string;
    poweredBy?: string;
    bodySnippet?: string;
    htmlLooksLikeSpa?: boolean;
    apiDocPath?: string;
    apiDocFlavor?: "openapi" | "swagger" | "asyncapi" | "raml" | "graphql";
    hasMx?: boolean;
    hasA?: boolean;
}

const API_DOC_PATHS = [
    "/openapi.json",
    "/openapi.yaml",
    "/swagger.json",
    "/v2/api-docs",
    "/v3/api-docs",
    "/api-docs",
    "/api-docs.json",
    "/.well-known/openapi.json",
    "/swagger/v1/swagger.json",
];

// Body-Tokens, die echte GraphQL-Backends verraten. Wichtig: NICHT einfach
// "graphql" matchen — Express's Default-404 ("Cannot GET /graphql") enthält
// das Wort und triggerte vor 2026-05-08 false-positive Klassifikationen
// (siehe Run #1 gegen geilemukke.de). Echte GraphQL-Marker:
//   - JSON-Antwort mit "errors" array (Standard-GraphQL-Error)
//   - JSON-Antwort mit "data" object (Standard-GraphQL-Success)
//   - HTML mit Playground/GraphiQL-Markup
//   - Schema-Introspection-Strings
const GRAPHQL_STRONG_HINTS = [
    /"errors"\s*:\s*\[\s*\{[^}]*"message"/,   // GraphQL-Error-Envelope
    /"data"\s*:\s*\{/,                           // GraphQL-Data-Envelope
    /<title>\s*GraphQL Playground/i,             // Playground-UI
    /<title>\s*GraphiQL/i,                        // GraphiQL-UI
    /__schema|__type|introspection/,              // Introspection-Markers
];

// Body-Patterns die einen orphaned Platform-Slot verraten (Render, Heroku,
// Vercel, Fly, Netlify) — d.h. die Subdomain zeigt auf einen Hosting-Slot, der
// keine deployte App mehr enthält. Das ist KEIN rest_api, sondern ein
// Subdomain-Takeover-Risiko.
const PLATFORM_ORPHAN_PATTERNS: { regex: RegExp; platform: string }[] = [
    { regex: /"message"\s*:\s*"Application not found"/i, platform: "Render" },
    { regex: /no such app/i, platform: "Heroku" },
    { regex: /This Heroku app/i, platform: "Heroku" },
    { regex: /heroku\.com\/no-such-app/i, platform: "Heroku" },
    { regex: /<title>\s*Application Error/i, platform: "Heroku-app-error" },
    { regex: /No Application Configured/i, platform: "Vercel" },
    { regex: /DEPLOYMENT_NOT_FOUND/i, platform: "Vercel" },
    { regex: /Site Not Found/i, platform: "Netlify" },
    { regex: /Not Found.*\bnetlify\.app\b/i, platform: "Netlify" },
    { regex: /could not find an active App/i, platform: "Fly.io" },
    { regex: /<title>\s*Repository not found/i, platform: "GitHub-Pages" },
    { regex: /There isn't a GitHub Pages site here/i, platform: "GitHub-Pages" },
    { regex: /BlobNotFound|NoSuchBucket/i, platform: "AWS-S3" },
    { regex: /<Code>NoSuchBucket<\/Code>/i, platform: "AWS-S3" },
];

// Express-Default-404-Signatur: "<pre>Cannot GET /[path]</pre>". Ein
// extrem starkes positives Signal für ein laufendes Express/Node-Backend
// auch wenn es auf der Root keine Route hat. Verhindert dass aktiv
// betriebene API-Backends als bloßer "webserver" miss-klassifiziert werden.
const EXPRESS_DEFAULT_404_RE = /<pre>Cannot\s+GET\s+\/[^<]*<\/pre>/i;

// Body-Marker, die auf ein modernes SPA-Frontend hindeuten.
const SPA_MARKERS = [
    'id="root"',
    'id="app"',
    'data-reactroot',
    'data-server-rendered',
    'ng-version=',
    "<script type=\"module\"",
    "/_next/",
    "/_nuxt/",
    "/_app/",
    "vite/dist/client",
];

export const serviceClassifyWorker: SecurityWorker = {
    jobKey: "service_classify",
    requiredScope: "passive_only",
    description:
        "Klassifiziert Service-Type pro Host (webserver/rest_api/spa/mailserver/…) " +
        "anhand HTTP-Probe + DNS-MX. Persistiert serviceType auf entity.data; " +
        "Trigger für api_security_active wenn rest_api detected.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return (
            target.kind === "asset_domain" ||
            target.kind === "asset_subdomain" ||
            target.kind === "asset_url" ||
            target.kind === "asset_host" ||
            target.kind === "asset_ip"
        );
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const host = normalizeHost(ctx.target.value);
        const findings: FindingDraft[] = [];

        const summary: ProbeSummary = {
            httpsReachable: false,
        };

        // ── DNS Pre-Checks ──────────────────────────────────────────────────
        try {
            const a = await dns.resolve4(host).catch(() => [] as string[]);
            const aaaa = await dns.resolve6(host).catch(() => [] as string[]);
            summary.hasA = a.length > 0 || aaaa.length > 0;
        } catch { /* ignore */ }
        try {
            const mx = await dns.resolveMx(host).catch(() => [] as { exchange: string; priority: number }[]);
            summary.hasMx = mx.length > 0;
        } catch { /* ignore */ }

        // ── HTTPS Root Probe (HEAD then GET-with-cap) ───────────────────────
        const rootProbe = await probeRoot(host, ctx.timeoutMs, ctx.abortSignal);
        if (rootProbe) {
            summary.httpsReachable = true;
            summary.httpStatus = rootProbe.status;
            summary.contentType = rootProbe.contentType;
            summary.serverHeader = rootProbe.server;
            summary.poweredBy = rootProbe.poweredBy;
            summary.bodySnippet = rootProbe.bodySnippet;
            summary.htmlLooksLikeSpa = looksLikeSpa(rootProbe.contentType, rootProbe.bodySnippet);
        }

        // ── API-Doc-Probes (sequenzell, abort beim ersten Hit) ──────────────
        if (summary.httpsReachable) {
            const apiHit = await probeApiDocs(host, ctx.timeoutMs, ctx.abortSignal);
            if (apiHit) {
                summary.apiDocPath = apiHit.path;
                summary.apiDocFlavor = apiHit.flavor;
            }
        }

        const serviceType = classify(summary);

        // ── Findings ────────────────────────────────────────────────────────
        findings.push({
            fingerprintInputs: ["service_classify", host, "type", serviceType],
            severity: "info",
            category: "config",
            title: `Service-Type: ${serviceType}`,
            description: describeServiceType(host, serviceType, summary),
            evidence: { ...summary },
        });

        if (serviceType === "rest_api" && summary.apiDocPath) {
            findings.push({
                fingerprintInputs: ["service_classify", host, "api_doc_exposed", summary.apiDocPath],
                severity: "low",
                category: "exposure",
                title: `REST-API-Spezifikation öffentlich: ${summary.apiDocPath}`,
                description:
                    `Auf ${host} ist eine ${summary.apiDocFlavor ?? "API"}-Doc unter ` +
                    `${summary.apiDocPath} öffentlich erreichbar. Aus dieser Spezifikation lassen sich ` +
                    "alle API-Endpoints + erwartete Parameter direkt extrahieren — Angreifer brauchen " +
                    "keine Discovery-Phase mehr.",
                recommendation:
                    "API-Doc nur authentifiziert ausliefern (z.B. nur mit gültigem JWT-Cookie) oder ganz " +
                    "aus Production entfernen. Falls die Doc bewusst öffentlich sein soll: dafür sorgen, " +
                    "dass jeder Endpoint stark authentifiziert + autorisiert ist.",
                evidence: { url: `https://${host}${summary.apiDocPath}`, flavor: summary.apiDocFlavor },
            });
        }

        // Dangling-Platform = echtes Subdomain-Takeover-Risiko. High-Severity,
        // weil ein Angreifer eine eigene App mit dem gleichen Slot-Namen auf
        // der Plattform registrieren kann und damit den Hostname unter Kontrolle
        // bringt — inklusive Cookies, OAuth-Redirects, etc.
        if (serviceType === "dangling_platform") {
            const platform = detectPlatformOrphan(summary) ?? "unknown-platform";
            findings.push({
                fingerprintInputs: ["service_classify", host, "dangling_platform", platform],
                severity: "high",
                category: "exposure",
                title: `Subdomain-Takeover-Risiko: ${host} zeigt auf leeren ${platform}-Slot`,
                description:
                    `${host} antwortet mit einer ${platform}-Default-Error-Page ` +
                    `("Application not found" / "no such app" / vergleichbar). Das bedeutet: ` +
                    `die Subdomain ist via DNS auf einen Hosting-Platform-Slot gepointet, der aktuell ` +
                    `keine deployte Applikation enthält. ` +
                    `\n\nWenn ein Angreifer eine eigene App mit dem gleichen Slot-Namen auf ` +
                    `der Plattform registriert, übernimmt er diese Subdomain — inklusive ` +
                    `Cookies, OAuth-Redirects, Browser-Trust und allem was an "${host}" gebunden ist.`,
                recommendation:
                    `Sofort eine der beiden Optionen umsetzen:\n` +
                    `  1) DNS-Record für ${host} entfernen (CNAME/A) wenn die Subdomain wirklich nicht mehr gebraucht wird.\n` +
                    `  2) Wenn die Subdomain weiter genutzt werden soll: Platform-App neu deployen ODER Domain-Pointer auf einen aktiven Service umlenken.\n` +
                    `Niemals "wir lassen das so weil es niemand benutzt" — genau darauf wartet ein Takeover-Angreifer.`,
                evidence: {
                    platform,
                    httpStatus: summary.httpStatus,
                    contentType: summary.contentType,
                    bodySnippet: summary.bodySnippet?.slice(0, 500),
                },
            });
        }

        return {
            success: true,
            rawOutput: { host, summary, serviceType },
            findings,
            entityDataPatch: {
                serviceType,
                serviceSignals: summary,
                serviceClassifiedAt: new Date().toISOString(),
            },
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

interface RootProbeResult {
    status: number;
    contentType: string;
    server?: string;
    poweredBy?: string;
    bodySnippet: string;
}

async function probeRoot(
    host: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<RootProbeResult | null> {
    const url = `https://${host}/`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 8_000));
        abortSignal?.addEventListener("abort", () => controller.abort(), { once: true });

        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: { "User-Agent": "node-secu/0.1 (+passive-scan)" },
        });
        clearTimeout(timer);

        // Body cap: 64KB ist genug für Tech-Marker
        const reader = res.body?.getReader();
        let body = "";
        if (reader) {
            const decoder = new TextDecoder();
            let total = 0;
            while (total < 64_000) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    total += value.byteLength;
                    body += decoder.decode(value, { stream: true });
                }
            }
            try { reader.cancel(); } catch { /* ignore */ }
        }

        return {
            status: res.status,
            contentType: res.headers.get("content-type") ?? "",
            server: res.headers.get("server") ?? undefined,
            poweredBy: res.headers.get("x-powered-by") ?? undefined,
            bodySnippet: body.slice(0, 4_000),
        };
    } catch {
        return null;
    }
}

interface ApiDocHit {
    path: string;
    flavor: "openapi" | "swagger" | "asyncapi" | "raml" | "graphql";
}

async function probeApiDocs(
    host: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<ApiDocHit | null> {
    for (const path of API_DOC_PATHS) {
        if (abortSignal?.aborted) return null;
        const hit = await probeApiDoc(host, path, timeoutMs);
        if (hit) return hit;
    }
    // GraphQL: prüfen ob /graphql 200 mit GraphQL-Hinweisen antwortet
    const gql = await probeGraphqlEndpoint(host, timeoutMs);
    if (gql) return { path: "/graphql", flavor: "graphql" };
    return null;
}

async function probeApiDoc(
    host: string,
    path: string,
    timeoutMs: number,
): Promise<ApiDocHit | null> {
    const url = `https://${host}${path}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5_000));
        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: { "User-Agent": "node-secu/0.1 (+passive-scan)" },
        });
        clearTimeout(timer);
        if (res.status !== 200) return null;
        const text = (await res.text()).slice(0, 8_000);
        // Negative-Filter: Orphan-Platform-Bodies maskieren sich gerne als
        // "OK"-JSON-200 (S3-Default-Index, Render-Bucket-Listing, …). Nicht
        // als API-Doc anrechnen.
        if (PLATFORM_ORPHAN_PATTERNS.some((p) => p.regex.test(text))) return null;
        const isJson = /^\s*[{[]/.test(text);
        if (!isJson && !path.endsWith(".yaml")) return null;
        if (/"openapi"\s*:/.test(text)) return { path, flavor: "openapi" };
        if (/"swagger"\s*:\s*"2/.test(text)) return { path, flavor: "swagger" };
        if (/"asyncapi"\s*:/.test(text)) return { path, flavor: "asyncapi" };
        if (path.endsWith(".yaml") && /^openapi:/m.test(text)) return { path, flavor: "openapi" };
        return null;
    } catch {
        return null;
    }
}

async function probeGraphqlEndpoint(host: string, timeoutMs: number): Promise<boolean> {
    const url = `https://${host}/graphql`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5_000));
        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: { "User-Agent": "node-secu/0.1 (+passive-scan)" },
        });
        clearTimeout(timer);

        // Negative-Filter: Express-Default-404 ("Cannot GET /graphql") oder
        // 5xx-Errors sind KEIN GraphQL — selbst wenn das Wort "graphql" im
        // Body steht. Status muss zu echtem GraphQL passen (200=Playground/Hit,
        // 400=invalid-query-error, 405=method-not-allowed-for-GET).
        if (res.status === 404 || res.status >= 500) return false;
        if (![200, 400, 405].includes(res.status)) return false;

        const text = (await res.text()).slice(0, 4_000);
        if (EXPRESS_DEFAULT_404_RE.test(text)) return false;

        // Strong-Hints: echte GraphQL-Antwort-Strukturen.
        return GRAPHQL_STRONG_HINTS.some((re) => re.test(text));
    } catch {
        return false;
    }
}

/**
 * Erkennt orphaned Platform-Slots (Render/Heroku/Vercel/Netlify/Fly/GH-Pages/S3).
 * Liefert die erkannte Plattform, oder null wenn nicht orphaned.
 */
function detectPlatformOrphan(s: ProbeSummary): string | null {
    if (!s.bodySnippet) return null;
    // Orphan-Pattern feuert üblicherweise bei 4xx/5xx-Status. 200 mit Orphan-
    // Pattern ist plausibel (z.B. statische S3-Default-Seite), wir nehmen alles
    // ≥ 200 mit, lassen aber nur "kleinere" Bodies durch (echte Apps haben
    // mehr Markup).
    if (!s.httpStatus) return null;
    for (const p of PLATFORM_ORPHAN_PATTERNS) {
        if (p.regex.test(s.bodySnippet)) return p.platform;
    }
    return null;
}

function looksLikeExpressBackend(s: ProbeSummary): boolean {
    if (!s.bodySnippet) return false;
    return EXPRESS_DEFAULT_404_RE.test(s.bodySnippet);
}

function looksLikeSpa(contentType: string | undefined, body: string | undefined): boolean {
    if (!body || !contentType) return false;
    if (!contentType.includes("text/html")) return false;
    return SPA_MARKERS.some((m) => body.includes(m));
}

function classify(s: ProbeSummary): ServiceType {
    // ── Orphan-Detection FIRST ─────────────────────────────────────────────
    // Bevor wir "rest_api" vergeben: ist das eine Hosting-Platform-Default-
    // Error-Page? Sonst klassifizieren wir orphaned Subdomains als rest_api,
    // was true-positive aussieht aber inhaltlich falsch ist (siehe
    // FULL_SCAN.md §1.5.4 Dangling-Subdomain-Klasse).
    if (s.httpsReachable && detectPlatformOrphan(s)) {
        return "dangling_platform";
    }

    if (s.apiDocPath) return "rest_api";

    if (s.httpsReachable) {
        const ct = s.contentType ?? "";

        // Express-Default-404 ("Cannot GET /") = laufendes Node-Backend ohne
        // Root-Route. Klares rest_api-Signal, auch wenn content-type=text/html.
        if (looksLikeExpressBackend(s)) return "rest_api";

        // Reines JSON von Root → wahrscheinlich API. Aber nur bei 2xx/3xx —
        // 4xx-JSON ohne Orphan-Marker könnte trotzdem ein API-Auth-Wall sein,
        // also auch ok. 5xx-JSON = kaputt, NICHT rest_api.
        if (ct.includes("application/json") && (s.httpStatus ?? 500) < 500) {
            return "rest_api";
        }

        if (ct.includes("text/html")) {
            return s.htmlLooksLikeSpa ? "spa" : "webserver";
        }

        // Andere Content-Types (text/plain, image/*, …) ohne klare Indikation
        return "webserver";
    }

    if (s.hasMx && !s.hasA) return "mailserver";
    if (s.hasMx && s.hasA) {
        // MX + A aber kein HTTPS → wahrscheinlich Mailserver mit blockiertem 443
        return "mailserver";
    }
    if (s.hasA) return "tcp_only";
    return "unknown";
}

function describeServiceType(host: string, type: ServiceType, s: ProbeSummary): string {
    switch (type) {
        case "rest_api":
            if (s.apiDocPath) {
                return `${host} exponiert eine REST-API. Spezifikation gefunden unter ${s.apiDocPath} (${s.apiDocFlavor ?? "openapi"}). Folge-Playbook: api_security_active.`;
            }
            if (looksLikeExpressBackend(s)) {
                return `${host} antwortet mit Express-Default-404 ("Cannot GET /") — laufendes Node.js/Express-Backend ohne Root-Route, vermutlich API-only. Folge-Playbook: api_security_active.`;
            }
            return `${host} antwortet auf / mit JSON — wahrscheinlich ein API-Backend. Folge-Playbook: api_security_active (auf authentifizierte Endpoints achten).`;
        case "spa":
            return `${host} liefert ein modernes Single-Page-Application-Frontend (React/Vue/Svelte/Next/Nuxt). Backend-API hängt typischerweise auf api.${host} oder einem Pfadprefix.`;
        case "webserver":
            return `${host} ist ein klassischer Webserver (HTML-Antwort auf /). Server: ${s.serverHeader ?? "unbekannt"}.`;
        case "mailserver":
            return `${host} hat MX-Records gesetzt und kein erreichbares HTTPS — wahrscheinlich ein dedizierter Mailserver-Hostname.`;
        case "tcp_only":
            return `${host} hat A/AAAA-Records, antwortet aber nicht auf HTTPS:443. Andere TCP-Services (siehe nmap_top1000) prüfen.`;
        case "dangling_platform": {
            const platform = detectPlatformOrphan(s) ?? "Hosting-Platform";
            return `${host} zeigt auf einen leeren ${platform}-Slot ("Application not found"-Default-Page). KEIN aktives Backend — aber Subdomain-Takeover-Risiko, weil eine fremde App mit dem gleichen Slot-Namen registriert werden könnte. Siehe High-Severity-Finding.`;
        }
        case "unknown":
        default:
            return `${host} konnte nicht klassifiziert werden (kein HTTPS, kein MX, ggf. keine A-Records).`;
    }
}

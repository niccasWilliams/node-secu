// API CORS-Check Worker — active_safe.
//
// Scope: active_safe.
// Begründung: macht 3 OPTIONS-Preflight-Requests + 3 GETs mit gewählten
// Origin-Headern auf Root + /api. Keine Auth-Brute, keine schreibenden
// Operationen, kein Fuzzing — gleiche Tier wie http_paths_probe.
//
// Ziel: detect klassische CORS-Misconfigurations:
//   1. Wildcard `*` mit Credentials: kombiniert ist nicht erlaubt
//   2. Reflection arbitrary Origin: Server schreibt jede Origin in den Header zurück
//   3. `Origin: null` reflected: subset des Reflection-Bugs, häufig in Sandboxes
//
// Output:
//   - findings:
//       * critical: "CORS reflektiert beliebige Origin mit Credentials"
//       * high:     "CORS reflektiert beliebige Origin (ohne Credentials)"
//       * medium:   "Origin: null reflektiert"
//       * low:      "Wildcard ACAO ohne Credentials" (Best-Practice-Hinweis)

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

interface CorsProbe {
    method: string;
    path: string;
    origin: string;
    status: number;
    headers: Record<string, string>;
}

const TEST_ORIGINS = [
    "https://evil.example.com",
    "https://attacker-controlled.test",
    "null",
];

const PROBED_PATHS = ["/", "/api", "/api/users", "/api/me"];

export const apiCorsCheckWorker: SecurityWorker = {
    jobKey: "api_cors_check",
    requiredScope: "active_safe",
    description:
        "Prüft CORS-Konfiguration: wird `Access-Control-Allow-Origin` gespiegelt? Mit " +
        "`Access-Control-Allow-Credentials: true` kombiniert? `Origin: null` reflektiert?",
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
        const probes: CorsProbe[] = [];

        for (const path of PROBED_PATHS) {
            for (const origin of TEST_ORIGINS) {
                if (ctx.abortSignal?.aborted) break;
                const probe = await probeCors(host, path, origin, ctx.timeoutMs);
                if (probe) probes.push(probe);
            }
        }

        const reflectedArbitrary = probes.filter(
            (p) => p.origin !== "null" &&
                p.headers["access-control-allow-origin"] === p.origin,
        );
        const reflectedWithCreds = reflectedArbitrary.filter(
            (p) => p.headers["access-control-allow-credentials"] === "true",
        );
        const reflectedNull = probes.filter(
            (p) => p.origin === "null" &&
                p.headers["access-control-allow-origin"] === "null",
        );
        const wildcardAco = probes.filter(
            (p) => p.headers["access-control-allow-origin"] === "*",
        );

        if (reflectedWithCreds.length > 0) {
            const example = reflectedWithCreds[0];
            findings.push({
                fingerprintInputs: ["cors", host, "reflect_with_credentials"],
                severity: "critical",
                category: "config",
                title: "CORS reflektiert beliebige Origin mit Credentials",
                description:
                    `Server reflektiert die Anfrage-Origin '${example.origin}' im Access-Control-Allow-Origin-Header ` +
                    "UND erlaubt Credentials (Cookies/Auth-Header). Ein Angreifer-Frontend kann damit jeden " +
                    "eingeloggten Browser-User dazu bringen, authentifizierte Requests an deine API zu schicken.",
                recommendation:
                    "Origin-Reflection durch eine strikte Allowlist ersetzen. Niemals Access-Control-Allow-Origin " +
                    "dynamisch aus der Origin-Header befüllen ohne Allowlist-Match.",
                evidence: {
                    sample: example,
                    path: example.path,
                    triggeredOrigin: example.origin,
                },
            });
        } else if (reflectedArbitrary.length > 0) {
            const example = reflectedArbitrary[0];
            findings.push({
                fingerprintInputs: ["cors", host, "reflect_no_creds"],
                severity: "high",
                category: "config",
                title: "CORS reflektiert beliebige Origin (ohne Credentials)",
                description:
                    `Server reflektiert '${example.origin}' im Access-Control-Allow-Origin-Header. Credentials sind ` +
                    "nicht erlaubt — der Schaden ist begrenzt, aber Angreifer können Public-Endpoints von beliebigen " +
                    "Domains aus konsumieren (Hotlinking, Datenscraping ohne Same-Origin-Beschränkung).",
                recommendation:
                    "Allowlist statt Reflection verwenden, oder `Access-Control-Allow-Origin: *` setzen wenn das " +
                    "Endpoint wirklich Public sein soll.",
                evidence: { sample: example },
            });
        }

        if (reflectedNull.length > 0) {
            const example = reflectedNull[0];
            findings.push({
                fingerprintInputs: ["cors", host, "reflect_null_origin"],
                severity: "medium",
                category: "config",
                title: "CORS reflektiert `Origin: null`",
                description:
                    "Server schreibt `Access-Control-Allow-Origin: null` zurück. `null` als Origin entsteht in " +
                    "iframe-sandbox-Kontexten und kann von Angreifer-Sandboxes ausgenutzt werden, um CORS-geschützte " +
                    "Endpoints zu konsumieren.",
                recommendation:
                    "`null` aus der Origin-Allowlist entfernen — diese Origin sollte nie ein erlaubtes CORS-Ziel sein.",
                evidence: { sample: example },
            });
        }

        if (wildcardAco.length > 0 && reflectedWithCreds.length === 0) {
            findings.push({
                fingerprintInputs: ["cors", host, "wildcard_aco"],
                severity: "info",
                category: "config",
                title: "CORS verwendet Wildcard (`*`)",
                description:
                    "Server setzt `Access-Control-Allow-Origin: *`. Das ist für Public-Read-APIs in Ordnung, " +
                    "aber Wildcard kann nicht mit Credentials kombiniert werden — Browser blockiert das automatisch.",
                evidence: { sample: wildcardAco[0] },
            });
        }

        return {
            success: true,
            rawOutput: { host, probeCount: probes.length, reflectedArbitrary: reflectedArbitrary.length, reflectedWithCreds: reflectedWithCreds.length },
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

async function probeCors(host: string, path: string, origin: string, timeoutMs: number): Promise<CorsProbe | null> {
    const url = `https://${host}${path}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5_000));
        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
                "User-Agent": "node-secu/0.1 (+active-safe-scan)",
                "Origin": origin,
                "Accept": "application/json",
            },
        });
        clearTimeout(timer);
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return {
            method: "GET",
            path,
            origin,
            status: res.status,
            headers,
        };
    } catch {
        return null;
    }
}

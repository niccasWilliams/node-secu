// OpenAPI Discovery Worker — active_safe.
//
// Scope: active_safe.
// Begründung: macht GETs auf well-known API-Doc-Pfade und parst die zurück-
// gelieferte JSON/YAML, um die deklarierten Endpoints zu extrahieren. Keine
// Auth-Brute, keine Param-Fuzzing, keine schreibenden Operationen. Identisch
// zur Tier von http_paths_probe / nmap_top1000.
//
// Output:
//   - rawOutput.endpoints: Array von { method, path, summary }
//   - findings:
//       * info: "OpenAPI/Swagger-Doc geparst — N Endpoints deklariert"
//       * low:  "Sensitive Endpoints in der Public-Spec" (admin, auth, internal, debug)
//   - entityDataPatch.openapi: { url, version, endpointCount, sensitiveEndpointCount }
//
// Nachfolgendes api_auth_probe nimmt die Endpoint-Liste aus rawOutput.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

interface ApiEndpoint {
    method: string;
    path: string;
    summary?: string;
    sensitive?: boolean;
}

const KNOWN_DOC_PATHS = [
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

const SENSITIVE_PATH_TOKENS = [
    "/admin",
    "/internal",
    "/debug",
    "/auth",
    "/login",
    "/token",
    "/users",
    "/secret",
    "/config",
    "/.env",
    "/migrate",
    "/backup",
];

export const openapiDiscoveryWorker: SecurityWorker = {
    jobKey: "openapi_discovery",
    requiredScope: "active_safe",
    description:
        "Holt OpenAPI/Swagger-Spezifikation und extrahiert die deklarierten Endpoints. " +
        "Markiert sensitive Pfade (admin/auth/internal). Liefert die Endpoint-Liste an " +
        "die Nachfolge-Worker (api_auth_probe etc.) via rawOutput.",
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

        let docUrl: string | undefined;
        let docFlavor: "openapi" | "swagger" | undefined;
        let endpoints: ApiEndpoint[] = [];

        for (const path of KNOWN_DOC_PATHS) {
            if (ctx.abortSignal?.aborted) break;
            const result = await fetchDoc(host, path, ctx.timeoutMs);
            if (!result) continue;
            docUrl = `https://${host}${path}`;
            docFlavor = result.flavor;
            endpoints = extractEndpoints(result.parsed);
            break;
        }

        if (!docUrl || endpoints.length === 0) {
            return {
                success: true,
                rawOutput: { host, docFound: false },
                findings: [],
                durationMs: Date.now() - start,
            };
        }

        const sensitive = endpoints.filter((e) => e.sensitive);

        findings.push({
            fingerprintInputs: ["openapi_discovery", host, "doc_parsed"],
            severity: "info",
            category: "config",
            title: `${docFlavor ?? "OpenAPI"}-Doc parsed: ${endpoints.length} Endpoints`,
            description:
                `Auf ${host} ist eine ${docFlavor}-Spezifikation mit ${endpoints.length} ` +
                `deklarierten Endpoints erreichbar (${docUrl}). Sensitive Pfade: ${sensitive.length}.`,
            evidence: {
                docUrl,
                endpointCount: endpoints.length,
                sensitiveCount: sensitive.length,
                sample: endpoints.slice(0, 10),
            },
        });

        if (sensitive.length > 0) {
            findings.push({
                fingerprintInputs: ["openapi_discovery", host, "sensitive_in_public_spec"],
                severity: "low",
                category: "exposure",
                title: `${sensitive.length} sensitive Endpoints in Public-API-Spec`,
                description:
                    `Die öffentlich erreichbare API-Spezifikation listet ${sensitive.length} Endpoints, ` +
                    "deren Pfade auf sensitive Operationen hindeuten (admin/auth/internal/debug). " +
                    "Aus der Spec lassen sich die exakten Aufruf-Signaturen ablesen.",
                recommendation:
                    "Public-Spec auf nicht-sensitive Endpoints reduzieren (z.B. mit `x-internal: true` " +
                    "ausblenden) ODER die Spec hinter eine Auth-Wand verlegen.",
                evidence: {
                    sensitiveSample: sensitive.slice(0, 10),
                },
            });
        }

        return {
            success: true,
            rawOutput: {
                host,
                docFound: true,
                docUrl,
                docFlavor,
                endpoints,
            },
            findings,
            entityDataPatch: {
                openapi: {
                    docUrl,
                    flavor: docFlavor,
                    endpointCount: endpoints.length,
                    sensitiveEndpointCount: sensitive.length,
                    discoveredAt: new Date().toISOString(),
                },
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

interface FetchedDoc {
    flavor: "openapi" | "swagger";
    parsed: Record<string, unknown>;
}

async function fetchDoc(host: string, path: string, timeoutMs: number): Promise<FetchedDoc | null> {
    const url = `https://${host}${path}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 8_000));
        const res = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            headers: { "User-Agent": "node-secu/0.1 (+active-safe-scan)" },
        });
        clearTimeout(timer);
        if (res.status !== 200) return null;
        // Body cap: 4 MB. OpenAPI-Specs der meisten Apps liegen unter 1 MB.
        const text = (await res.text()).slice(0, 4_000_000);
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { return null; }
        if (!parsed || typeof parsed !== "object") return null;
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.openapi === "string") return { flavor: "openapi", parsed: obj };
        if (obj.swagger === "2.0" || obj.swagger === 2) return { flavor: "swagger", parsed: obj };
        return null;
    } catch {
        return null;
    }
}

function extractEndpoints(spec: Record<string, unknown>): ApiEndpoint[] {
    const paths = spec.paths;
    if (!paths || typeof paths !== "object") return [];
    const out: ApiEndpoint[] = [];
    for (const [pathKey, pathItem] of Object.entries(paths as Record<string, unknown>)) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const [method, op] of Object.entries(pathItem as Record<string, unknown>)) {
            if (!["get", "post", "put", "patch", "delete", "options", "head"].includes(method)) continue;
            const summary = (op as Record<string, unknown>)?.summary;
            const lowerPath = pathKey.toLowerCase();
            const sensitive = SENSITIVE_PATH_TOKENS.some((t) => lowerPath.includes(t));
            out.push({
                method: method.toUpperCase(),
                path: pathKey,
                summary: typeof summary === "string" ? summary : undefined,
                sensitive,
            });
        }
    }
    return out;
}

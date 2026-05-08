// API Auth-Probe Worker — active_safe.
//
// Scope: active_safe.
// Begründung: macht GETs (read-only) ohne Authentication auf eine kuratierte
// Liste typischer API-Pfade. Ziel: schauen, ob ein Endpoint, der laut Naming
// auth-pflichtig sein sollte (/api/users, /api/admin, /api/me), tatsächlich
// 200 mit Daten liefert. Keine schreibenden Methoden, kein Auth-Brute, kein
// Param-Fuzzing. Identische Tier wie http_paths_probe.
//
// Output:
//   - findings:
//       * critical: "Sensitive Endpoint ohne Auth: <path>" (200 mit Daten-Leak)
//       * high: "Auth-Gate fehlerhaft: <path>" (200 OK statt 401/403, JSON-Body
//                ohne offensichtliche Daten — könnte Empty/Skeleton sein)
//   - rawOutput: full Probe-Liste

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

interface ProbedEndpoint {
    path: string;
    status: number;
    contentType: string;
    bodySize: number;
    bodySnippet: string;
    authMissing: boolean;
    leakIndicators: string[];
}

// Standard-API-Pfade, die fast immer Auth erfordern, wenn sie existieren.
const PROBED_PATHS = [
    "/api/users",
    "/api/users/me",
    "/api/me",
    "/api/admin",
    "/api/admin/users",
    "/api/internal",
    "/api/v1/users",
    "/api/v1/admin",
    "/api/v2/users",
    "/api/v2/admin",
    "/api/auth/me",
    "/api/profile",
    "/api/dashboard",
    "/api/orders",
    "/api/customers",
    "/api/invoices",
    "/api/v1/me",
    "/admin/api/users",
    "/internal/users",
];

// Tokens im Response-Body, die echten Daten-Leak signalisieren (nicht "Empty
// Skeleton" wie z.B. eine SPA-Shell, die für jeden Pfad das gleiche HTML liefert).
const LEAK_TOKENS = [
    '"email":', '"password":', '"phone":', '"address":',
    '"firstName":', '"lastName":', '"username":',
    '"id":', '"userId":',
    '"role":', '"permissions":',
    '"createdAt":', '"updatedAt":',
];

export const apiAuthProbeWorker: SecurityWorker = {
    jobKey: "api_auth_probe",
    requiredScope: "active_safe",
    description:
        "Probt typische auth-pflichtige API-Pfade ohne Credentials und prüft, ob der " +
        "Endpoint sauber mit 401/403 abriegelt oder ob der Auth-Gate fehlt (200 mit Daten).",
    defaultTimeoutMs: 60_000,

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
        const probes: ProbedEndpoint[] = [];

        for (const path of PROBED_PATHS) {
            if (ctx.abortSignal?.aborted) break;
            const probe = await probePath(host, path, ctx.timeoutMs);
            if (probe) probes.push(probe);
        }

        const authMissing = probes.filter((p) => p.authMissing);
        const leakingEndpoints = authMissing.filter((p) => p.leakIndicators.length > 0);

        for (const p of leakingEndpoints) {
            findings.push({
                fingerprintInputs: ["api_auth_probe", host, "data_leak", p.path],
                severity: "critical",
                category: "auth",
                title: `Daten-Leak ohne Auth: ${p.path}`,
                description:
                    `Endpoint ${p.path} antwortet ohne Authentication mit Status ${p.status} und JSON-Body, ` +
                    `der typische User-/Daten-Felder enthält (${p.leakIndicators.slice(0, 3).join(", ")}). ` +
                    "Das ist ein Auth-Bypass — Angreifer können diese Daten ohne Login abgreifen.",
                recommendation:
                    "Auth-Middleware prüfen: ist der Endpoint vor dem Router-Handler durch eine zentrale " +
                    "isAuthenticated()-Guard geschützt? IDOR-Möglichkeiten (Pfad-Param wechseln) zusätzlich validieren.",
                evidence: {
                    url: `https://${host}${p.path}`,
                    status: p.status,
                    contentType: p.contentType,
                    bodySize: p.bodySize,
                    leakIndicators: p.leakIndicators,
                },
            });
        }

        // 200 ohne Daten-Leak: schwächer, aber immer noch ein Hinweis ("Skeleton-leak")
        for (const p of authMissing.filter((p) => p.leakIndicators.length === 0)) {
            findings.push({
                fingerprintInputs: ["api_auth_probe", host, "auth_gate_skeleton", p.path],
                severity: "low",
                category: "auth",
                title: `Auth-Gate möglicherweise fehlerhaft: ${p.path}`,
                description:
                    `Endpoint ${p.path} antwortet mit Status ${p.status} statt 401/403, der Body enthält ` +
                    "aber keine offensichtlichen Daten. Wahrscheinlich SPA-Skeleton oder Empty-Response — manuell prüfen.",
                evidence: {
                    url: `https://${host}${p.path}`,
                    status: p.status,
                    contentType: p.contentType,
                    bodySize: p.bodySize,
                },
            });
        }

        return {
            success: true,
            rawOutput: { host, probedCount: probes.length, authMissing: authMissing.length, leakingEndpoints: leakingEndpoints.length, probes },
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

async function probePath(host: string, path: string, timeoutMs: number): Promise<ProbedEndpoint | null> {
    const url = `https://${host}${path}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 6_000));
        const res = await fetch(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
                "User-Agent": "node-secu/0.1 (+active-safe-scan)",
                "Accept": "application/json",
            },
        });
        clearTimeout(timer);

        const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
        const text = (await res.text()).slice(0, 8_000);
        const isJson = contentType.includes("json") || /^\s*[{[]/.test(text);

        // 401/403/redirect → Auth-Gate funktioniert sauber
        const status = res.status;
        const authProperlyGated = status === 401 || status === 403 ||
            (status >= 300 && status < 400);

        // 404 → Endpoint existiert nicht; ignorieren (negative Evidence)
        // 200 mit JSON → potenzieller Auth-Bypass
        // 200 mit HTML → wahrscheinlich SPA-Shell (Skeleton-Antwort), nicht relevant
        const authMissing = !authProperlyGated && status >= 200 && status < 300 && isJson;

        const leakIndicators = authMissing
            ? LEAK_TOKENS.filter((t) => text.includes(t))
            : [];

        return {
            path,
            status,
            contentType,
            bodySize: text.length,
            bodySnippet: text.slice(0, 200),
            authMissing,
            leakIndicators,
        };
    } catch {
        return null;
    }
}

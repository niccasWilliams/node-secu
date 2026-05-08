// Phase 2.7 — github_secret_scan Worker (aggressive bonus).
//
// Input:  asset_domain
// Output: Findings (kategorie=leak) für Secrets/Tokens/Connection-Strings, die
//         in PUBLIC GitHub-Repos auftauchen und auf die Ziel-Domain referenzieren.
//
// Methodik: GitHub Code-Search mit Domain-Anker + häufigen Secret-Patterns
// (api_key, secret, password, token, mongodb://, redis://, postgres://, AWS-Keys).
// Quelle ist 100% öffentlich (api.github.com/search/code) — Worker bleibt
// passive_only.
//
// WICHTIG: search/code-Endpoint hat eigene 30/min-Quota selbst MIT Token. Wir
// nutzen den dedizierten provider-key "github-search-code" mit langem Backoff.

import axios from "axios";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";

interface CodeSearchItem {
    name: string;
    path: string;
    sha: string;
    html_url: string;
    repository?: { full_name?: string; private?: boolean };
}

interface CodeSearchResponse {
    total_count?: number;
    items?: CodeSearchItem[];
}

// Secret-Pattern × Severity. Reihenfolge = Suchreihenfolge (high-signal zuerst).
const SECRET_QUERIES: Array<{ q: string; severity: FindingDraft["severity"]; category: FindingDraft["category"]; label: string }> = [
    { q: "AWS_SECRET_ACCESS_KEY",  severity: "critical", category: "leak", label: "AWS Secret-Access-Key" },
    { q: "AWS_ACCESS_KEY_ID AKIA", severity: "high",     category: "leak", label: "AWS Access-Key-ID" },
    { q: "BEGIN RSA PRIVATE KEY",  severity: "critical", category: "leak", label: "RSA Private-Key" },
    { q: "BEGIN OPENSSH PRIVATE KEY", severity: "critical", category: "leak", label: "OpenSSH Private-Key" },
    { q: "mongodb+srv://",         severity: "high",     category: "leak", label: "MongoDB Connection-String" },
    { q: "postgres://",            severity: "high",     category: "leak", label: "Postgres Connection-String" },
    { q: "mysql://",               severity: "high",     category: "leak", label: "MySQL Connection-String" },
    { q: "redis://",               severity: "medium",   category: "leak", label: "Redis Connection-String" },
    { q: "api_key",                severity: "medium",   category: "leak", label: "Generic api_key" },
    { q: "secret_key",             severity: "medium",   category: "leak", label: "Generic secret_key" },
    { q: "password",               severity: "low",      category: "leak", label: "Generic password" },
];

export const githubSecretScanWorker: SecurityWorker = {
    jobKey: "github_secret_scan",
    requiredScope: "passive_only",
    description: "Sucht Secrets/Tokens/Connection-Strings in PUBLIC GitHub-Repos, gefiltert auf die Ziel-Domain.",
    defaultTimeoutMs: 120_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "asset_subdomain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const domain = ctx.target.value.trim().toLowerCase();
        const token = process.env.GH_TOKEN;
        const findings: FindingDraft[] = [];
        const raw: Record<string, unknown> = { domain, queries: [] as unknown[] };

        if (!token) {
            return {
                success: true,
                findings: [],
                error: "skipped:gh_token_missing",
                durationMs: Date.now() - start,
            };
        }

        const headers = {
            "User-Agent": "node-secu-osint/2.7",
            "Accept": "application/vnd.github+json",
            "Authorization": `Bearer ${token}`,
        };

        for (const probe of SECRET_QUERIES) {
            if (ctx.abortSignal?.aborted) break;
            const q = `"${domain}" ${probe.q}`;
            const release = await acquireProvider("github-search-code", { abortSignal: ctx.abortSignal });
            try {
                const res = await axios.get<CodeSearchResponse>("https://api.github.com/search/code", {
                    timeout: 15_000,
                    signal: ctx.abortSignal,
                    headers,
                    params: { q, per_page: 5 },
                    validateStatus: (s) => s < 500,
                });

                if (res.status === 429 || res.status === 403) {
                    await markProvider429("github-search-code", `${res.status} on "${probe.q}"`);
                    (raw.queries as unknown[]).push({ q: probe.q, status: res.status, paused: true });
                    break; // brich die Schleife ab — Provider ist eh pausiert
                }
                if (res.status === 422 || res.status === 404) {
                    (raw.queries as unknown[]).push({ q: probe.q, status: res.status, hits: 0 });
                    markProviderSuccess("github-search-code");
                    continue;
                }
                if (res.status !== 200) {
                    (raw.queries as unknown[]).push({ q: probe.q, status: res.status });
                    continue;
                }

                markProviderSuccess("github-search-code");
                const total = res.data?.total_count ?? 0;
                const items = res.data?.items ?? [];
                (raw.queries as unknown[]).push({ q: probe.q, total, sample: items.slice(0, 3).map((i) => i.html_url) });

                if (total > 0 && items.length > 0) {
                    // Ein Finding pro probe — items als evidence (max 5).
                    findings.push({
                        fingerprintInputs: ["osint_github_secret", probe.q, domain],
                        severity: probe.severity,
                        category: probe.category,
                        title: `Mögliches ${probe.label} in public GitHub-Repos zu ${domain}`,
                        description:
                            `GitHub-Code-Search liefert ${total} Treffer für "${probe.q}" + "${domain}". ` +
                            `Die ersten ${items.length} Hits sind unten verlinkt — manuelle Verifikation nötig (false-positives bei generischen Patterns möglich).`,
                        evidence: {
                            query: probe.q,
                            total,
                            hits: items.slice(0, 5).map((i) => ({
                                repo: i.repository?.full_name,
                                path: i.path,
                                url: i.html_url,
                            })),
                        },
                        recommendation:
                            "Treffer manuell prüfen, ggf. Repo-Owner kontaktieren, Secret rotieren, bei legitimer Exposure Codeowner-Notify einrichten.",
                    });
                }
            } catch (err: unknown) {
                const e = err as { response?: { status?: number }; message?: string };
                if (e.response?.status === 429 || e.response?.status === 403) {
                    await markProvider429("github-search-code", e.message);
                    break;
                }
                (raw.queries as unknown[]).push({ q: probe.q, error: e.message });
            } finally {
                release();
            }
        }

        return {
            success: true,
            rawOutput: raw,
            findings,
            durationMs: Date.now() - start,
        };
    },
};

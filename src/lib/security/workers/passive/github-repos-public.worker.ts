// Sprint 3 (OSINT-Engine, features.md §3.3 #29b) — github_repos_public.
//
// Input:  social_account mit data.platform="github" und data.handle=<login>
// Output: entityDataPatch — bereichert das social_account um publicRepos[]:
//           [{ name, fullName, language, description, pushedAt, stargazers, isFork }]
//         + Top-Languages-Aggregat (entity.data.repoLanguages: ["TypeScript", "Go", …]).
//         KEINE neuen Entities, KEINE eigenen Findings — Anreicherung des bestehenden
//         GitHub-Account-Knotens. (Entity-Discovery passiert in github_events_public.)
//
// Quelle: GET /users/{login}/repos?per_page=30&sort=pushed
// Auth:   GH_TOKEN. Ohne Token läuft die API zwar, hat aber 60/h hard-cap und
//         keinen Sub-Quota-Schutz für Suchen → wir bleiben strikt auf Token.
//
// Quota: github-token (5000/h) — sehr großzügig. Kein eigener Sub-Limiter nötig.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";
import { osintHttp } from "../../osint/osint-http";
import { database } from "@/db";
import { entities } from "@/db/individual/individual-schema";
import { eq } from "drizzle-orm";

interface GitHubRepo {
    name?: string;
    full_name?: string;
    private?: boolean;
    fork?: boolean;
    description?: string | null;
    language?: string | null;
    pushed_at?: string;
    updated_at?: string;
    stargazers_count?: number;
    forks_count?: number;
    archived?: boolean;
    html_url?: string;
}

function authHeaders(token: string): Record<string, string> {
    return {
        "User-Agent": "node-secu-osint/3.0",
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
    };
}

export const githubReposPublicWorker: SecurityWorker = {
    jobKey: "github_repos_public",
    requiredScope: "passive_only",
    description:
        "Listet die öffentlichen Repos eines GitHub-Users (input: social_account, " +
        "platform=github). Schreibt publicRepos[] und repoLanguages[] in entity.data.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "social_account";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const sourceId = typeof ctx.target.id === "string" ? Number(ctx.target.id) : ctx.target.id;
        if (!Number.isFinite(sourceId) || sourceId <= 0) {
            return {
                success: false,
                findings: [],
                error: "invalid_source_id",
                durationMs: Date.now() - start,
            };
        }

        const token = process.env.GH_TOKEN;
        if (!token) {
            return {
                success: true,
                findings: [],
                error: "skipped:gh_token_missing",
                durationMs: Date.now() - start,
            };
        }

        const [row] = await database.select().from(entities).where(eq(entities.id, sourceId)).limit(1);
        if (!row) {
            return {
                success: false,
                findings: [],
                error: "source_entity_not_found",
                durationMs: Date.now() - start,
            };
        }
        const data = (row.data ?? {}) as Record<string, unknown>;
        const platform = typeof data.platform === "string" ? data.platform : null;
        const handle = typeof data.handle === "string" ? data.handle : null;
        if (platform !== "github" || !handle) {
            return {
                success: true,
                findings: [],
                error: "skipped:not_a_github_social_account",
                durationMs: Date.now() - start,
            };
        }

        const providerKey = "github-token";
        const release = await acquireProvider(providerKey, { abortSignal: ctx.abortSignal });
        try {
            const res = await osintHttp.client().get<GitHubRepo[]>(
                `https://api.github.com/users/${encodeURIComponent(handle)}/repos`,
                {
                    timeout: 15_000,
                    signal: ctx.abortSignal,
                    params: { per_page: 30, sort: "pushed", type: "owner" },
                    headers: authHeaders(token),
                    validateStatus: () => true,
                },
            );

            if (res.status === 429 || res.status === 403) {
                await markProvider429(providerKey, `gh users/repos ${res.status}`);
                return {
                    success: true,
                    findings: [],
                    error: `provider_paused:${providerKey}`,
                    durationMs: Date.now() - start,
                };
            }
            if (res.status === 404) {
                // User wurde gelöscht/umbenannt — nicht-fatal.
                markProviderSuccess(providerKey);
                return {
                    success: true,
                    rawOutput: { handle, total: 0, status: 404 },
                    findings: [],
                    entityDataPatch: {
                        publicRepos: [],
                        repoLanguages: [],
                        reposLastFetchedAt: new Date().toISOString(),
                    },
                    durationMs: Date.now() - start,
                };
            }
            if (res.status !== 200) {
                return {
                    success: false,
                    findings: [],
                    error: `github_repos_failed:${res.status}`,
                    durationMs: Date.now() - start,
                };
            }
            markProviderSuccess(providerKey);

            const items = Array.isArray(res.data) ? res.data : [];
            // Public-Repos werden vom API per default gelistet (Token sieht keine
            // privaten anderer User). Nochmal explizit filtern für Defensive-Coding.
            const publicRepos = items
                .filter((r) => !r.private)
                .map((r) => ({
                    name: r.name ?? null,
                    fullName: r.full_name ?? null,
                    description: r.description ?? null,
                    language: r.language ?? null,
                    pushedAt: r.pushed_at ?? null,
                    stargazers: r.stargazers_count ?? 0,
                    forks: r.forks_count ?? 0,
                    isFork: Boolean(r.fork),
                    isArchived: Boolean(r.archived),
                    htmlUrl: r.html_url ?? null,
                }));

            // Language-Histogramm (Top-by-Repo-Count). Forks zählen mit, aber halb
            // gewichtet — fork-heavy Profile sollen die Top-Sprache nicht trivially
            // verzerren.
            const langCounts = new Map<string, number>();
            for (const r of publicRepos) {
                if (!r.language) continue;
                const w = r.isFork ? 0.5 : 1;
                langCounts.set(r.language, (langCounts.get(r.language) ?? 0) + w);
            }
            const repoLanguages = [...langCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([lang]) => lang);

            return {
                success: true,
                rawOutput: { handle, total: publicRepos.length, languages: repoLanguages },
                findings: [],
                entityDataPatch: {
                    publicRepos,
                    repoLanguages,
                    reposLastFetchedAt: new Date().toISOString(),
                },
                durationMs: Date.now() - start,
            };
        } finally {
            release();
        }
    },
};

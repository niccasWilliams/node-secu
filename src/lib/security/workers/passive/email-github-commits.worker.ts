// Phase 2.7 — email_github_commits Worker.
//
// Input:  email_address-Entity
// Output: Wenn die Email als Commit-Author auf GitHub auftaucht: discovered
//         social_account (platform=github, handle=login) + Repos als context-Findings.
//
// Quelle: api.github.com/search/commits?q=author-email:<email>
// Auth:   `GH_TOKEN` env optional. Ohne Token: 30 req/min hard-cap, search-API
//         erfordert User-Agent. Mit Token: 5000 req/h gesamt; SEARCH-API hat
//         eine separate harte Sub-Quota von 30/min selbst mit Token.
//
// Doku: https://docs.github.com/en/rest/search/search#search-commits

import axios from "axios";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";

interface GitHubCommit {
    sha: string;
    html_url: string;
    repository?: { full_name?: string; html_url?: string };
    author?: { login?: string; html_url?: string; avatar_url?: string };
    commit?: { message?: string; author?: { name?: string; email?: string; date?: string } };
}

interface CommitSearchResponse {
    total_count?: number;
    items?: GitHubCommit[];
}

export const emailGithubCommitsWorker: SecurityWorker = {
    jobKey: "email_github_commits",
    requiredScope: "passive_only",
    description: "Sucht GitHub-Commits mit dieser Email als Author → leitet GitHub-Login + Repo-Aktivität ab.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "email_address";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const email = ctx.target.value.trim().toLowerCase();
        const token = process.env.GH_TOKEN;
        const providerKey = token ? "github-token" : "github-public";

        if (!token) {
            // Ohne Token bringt's bei Search-Commits nichts — die API erfordert
            // sogar mit dem `cloak`-preview-Header oft trotzdem Auth. Wir skippen
            // sauber statt fehlerhaft zu fummeln.
            return {
                success: true,
                findings: [],
                error: "skipped:gh_token_missing",
                durationMs: Date.now() - start,
            };
        }

        const release = await acquireProvider(providerKey, { abortSignal: ctx.abortSignal });
        try {
            const url = "https://api.github.com/search/commits";
            const res = await axios.get<CommitSearchResponse>(url, {
                timeout: 15_000,
                signal: ctx.abortSignal,
                params: { q: `author-email:${email}`, per_page: 30, sort: "author-date", order: "desc" },
                headers: {
                    "User-Agent": "node-secu-osint/2.7",
                    "Accept": "application/vnd.github.cloak-preview+json",
                    "Authorization": `Bearer ${token}`,
                },
                validateStatus: (s) => s < 500,
            });

            if (res.status === 422 || res.status === 404) {
                // GitHub liefert 422 wenn Query keine Treffer hat.
                markProviderSuccess(providerKey);
                return {
                    success: true,
                    rawOutput: { email, total: 0 },
                    findings: [],
                    durationMs: Date.now() - start,
                };
            }
            if (res.status === 429 || res.status === 403) {
                await markProvider429(providerKey, `${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
                return {
                    success: true,
                    findings: [],
                    error: `provider_paused:${providerKey}`,
                    durationMs: Date.now() - start,
                };
            }
            if (res.status !== 200) {
                return {
                    success: false,
                    findings: [],
                    error: `github_search_failed:${res.status}`,
                    durationMs: Date.now() - start,
                };
            }

            markProviderSuccess(providerKey);
            const items = res.data?.items ?? [];
            const total = res.data?.total_count ?? items.length;

            // Login → frühester Commit (für displayName).
            const byLogin = new Map<string, { commits: number; latestRepo?: string; profileUrl?: string }>();
            const repos = new Set<string>();
            for (const c of items) {
                const login = c.author?.login;
                if (login) {
                    const cur = byLogin.get(login) ?? { commits: 0 };
                    cur.commits += 1;
                    cur.profileUrl = cur.profileUrl ?? c.author?.html_url;
                    cur.latestRepo = cur.latestRepo ?? c.repository?.full_name;
                    byLogin.set(login, cur);
                }
                if (c.repository?.full_name) repos.add(c.repository.full_name);
            }

            const discovered: DiscoveredEntityDraft[] = [];
            for (const [login, info] of byLogin) {
                discovered.push({
                    kind: "social_account",
                    primaryValue: login,
                    discriminator: "github",
                    displayName: `github:${login}`,
                    data: {
                        platform: "github",
                        handle: login,
                        profileUrl: info.profileUrl ?? `https://github.com/${login}`,
                        commitCount: info.commits,
                        latestRepo: info.latestRepo,
                    },
                    relationshipToRoot: {
                        kind: "owns_social_account",
                        direction: "from_root_to_discovered",
                        confidence: 90,
                    },
                    source: "osint_github_commits",
                });

                // Auch als Username-Entity, wenn Operator später cross-platform forschen will.
                discovered.push({
                    kind: "username",
                    primaryValue: login,
                    displayName: login,
                    data: { value: login, normalized: login.toLowerCase(), observedPlatforms: ["github"] },
                    relationshipToRoot: {
                        kind: "alias_of",
                        direction: "from_root_to_discovered",
                        confidence: 85,
                    },
                    source: "osint_github_commits",
                });
            }

            const findings: FindingDraft[] = [];
            if (total > 0) {
                findings.push({
                    fingerprintInputs: ["osint_github_commits", "found", email],
                    severity: "info",
                    category: "exposure",
                    title: `${total} GitHub-Commits mit ${email} als Author`,
                    description: `Auf GitHub sind Commits mit dieser Email öffentlich sichtbar — Login(s): ${[...byLogin.keys()].join(", ")}.`,
                    evidence: {
                        totalCommits: total,
                        loginsFound: [...byLogin.keys()],
                        repos: [...repos].slice(0, 10),
                    },
                });
            }

            return {
                success: true,
                rawOutput: { email, total, logins: [...byLogin.keys()], repos: [...repos] },
                findings,
                discoveredEntities: discovered,
                durationMs: Date.now() - start,
            };
        } catch (err: unknown) {
            const e = err as { response?: { status?: number }; message?: string };
            if (e.response?.status === 429 || e.response?.status === 403) {
                await markProvider429(providerKey, e.message);
                return {
                    success: true,
                    findings: [],
                    error: `provider_paused:${providerKey}`,
                    durationMs: Date.now() - start,
                };
            }
            return {
                success: false,
                findings: [],
                error: e.message ?? "github_fetch_failed",
                durationMs: Date.now() - start,
            };
        } finally {
            release();
        }
    },
};

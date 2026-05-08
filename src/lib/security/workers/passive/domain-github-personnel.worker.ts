// Phase 2.7 — domain_github_personnel Worker.
//
// Input:  asset_domain-Entity
// Output: pro entdecktem GitHub-User:
//          - person (relationshipToRoot=employs)
//          - email_address (relationshipToRoot=email_of_domain) — falls public auf Profil
//          - username (data.platform=github, linked via Email)
//
// Quellen:
//  1. /search/users?q={domain}+in:email — erste Stufe
//  2. /users/{login} — pro Hit, public Email/Name extrahieren
//  3. (optional) /search/commits?q=author-email:*@{domain} — wenn cloak-preview ok
//
// Auth: GH_TOKEN env optional. Ohne Token ist /search/users-API zwar 30/min hard,
// liefert aber überhaupt Results — wir versuchen es. Skip wenn Token rate-limit
// und kein Hit.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";
import { osintHttp } from "../../osint/osint-http";

interface GitHubUserHit {
    login?: string;
    id?: number;
    html_url?: string;
    avatar_url?: string;
}

interface UsersSearchResponse {
    total_count?: number;
    items?: GitHubUserHit[];
}

interface GitHubUserDetail {
    login?: string;
    name?: string | null;
    email?: string | null;
    company?: string | null;
    blog?: string | null;
    location?: string | null;
    bio?: string | null;
    public_repos?: number;
    html_url?: string;
}

function authHeaders(token: string | undefined): Record<string, string> {
    const base: Record<string, string> = {
        "User-Agent": "node-secu-osint/2.7",
        "Accept": "application/vnd.github+json",
    };
    if (token) base["Authorization"] = `Bearer ${token}`;
    return base;
}

export const domainGithubPersonnelWorker: SecurityWorker = {
    jobKey: "domain_github_personnel",
    requiredScope: "passive_only",
    description: "Findet GitHub-User mit Email auf der Ziel-Domain → emittiert Person + Email + Username-Entities mit Beziehungen zur Domain.",
    defaultTimeoutMs: 90_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "asset_subdomain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const domain = ctx.target.value.trim().toLowerCase();
        const token = process.env.GH_TOKEN;
        const searchKey = "github-search-users";

        if (!token) {
            // /search/users ohne Token funktioniert teilweise, aber liefert oft
            // 422 für "@domain"-Queries. Skip lieber sauber.
            return {
                success: true,
                findings: [],
                error: "skipped:gh_token_missing",
                durationMs: Date.now() - start,
            };
        }

        const release = await acquireProvider(searchKey, { abortSignal: ctx.abortSignal });
        let userHits: GitHubUserHit[] = [];
        try {
            const url = "https://api.github.com/search/users";
            const res = await osintHttp.client().get<UsersSearchResponse>(url, {
                timeout: 15_000,
                signal: ctx.abortSignal,
                params: { q: `${domain} in:email`, per_page: 50 },
                headers: authHeaders(token),
                validateStatus: () => true,
            });
            if (res.status === 429 || res.status === 403) {
                await markProvider429(searchKey, `gh search-users ${res.status}`);
                return {
                    success: true,
                    findings: [],
                    error: `provider_paused:${searchKey}`,
                    durationMs: Date.now() - start,
                };
            }
            if (res.status === 422) {
                markProviderSuccess(searchKey);
                userHits = [];
            } else if (res.status === 200) {
                markProviderSuccess(searchKey);
                userHits = res.data?.items ?? [];
            } else {
                return {
                    success: false,
                    findings: [],
                    error: `github_search_users_failed:${res.status}`,
                    durationMs: Date.now() - start,
                };
            }
        } finally {
            release();
        }

        // Phase 2: pro Hit /users/{login} aufrufen für public-Email/Name. Token-key.
        const detailKey = "github-token";
        const personnel: Array<{
            login: string;
            name?: string | null;
            email?: string | null;
            profileUrl?: string;
            company?: string | null;
            location?: string | null;
            bio?: string | null;
        }> = [];

        for (const hit of userHits) {
            if (!hit.login) continue;
            if (ctx.abortSignal?.aborted) break;
            const r = await acquireProvider(detailKey, { abortSignal: ctx.abortSignal });
            try {
                const detailRes = await osintHttp.client().get<GitHubUserDetail>(
                    `https://api.github.com/users/${encodeURIComponent(hit.login)}`,
                    {
                        timeout: 10_000,
                        signal: ctx.abortSignal,
                        headers: authHeaders(token),
                        validateStatus: () => true,
                    },
                );
                if (detailRes.status === 429 || detailRes.status === 403) {
                    await markProvider429(detailKey, `gh users ${detailRes.status}`);
                    break;
                }
                if (detailRes.status !== 200) continue;
                markProviderSuccess(detailKey);
                const d = detailRes.data;
                personnel.push({
                    login: hit.login,
                    name: d.name ?? null,
                    email: d.email ? d.email.toLowerCase() : null,
                    profileUrl: d.html_url ?? hit.html_url,
                    company: d.company ?? null,
                    location: d.location ?? null,
                    bio: d.bio ?? null,
                });
            } catch {
                // Einzelner User-Fehler ist nicht-fatal — weiter.
            } finally {
                r();
            }
        }

        const discovered: DiscoveredEntityDraft[] = [];
        for (const p of personnel) {
            // Person-Entity (root = Domain, kind=employs)
            const personDisplay = p.name?.trim() || p.login;
            discovered.push({
                kind: "person",
                primaryValue: p.email ?? `gh:${p.login}`,
                discriminator: p.name ? p.name.trim() : `gh:${p.login}`,
                displayName: personDisplay,
                data: {
                    githubLogin: p.login,
                    name: p.name,
                    email: p.email,
                    company: p.company,
                    location: p.location,
                    bio: p.bio,
                    profileUrl: p.profileUrl,
                    discoveredVia: "github_personnel",
                },
                relationshipToRoot: {
                    kind: "employs",
                    direction: "from_root_to_discovered",
                    confidence: p.email && p.email.endsWith(`@${domain}`) ? 80 : 50,
                },
                source: "osint_github_personnel",
            });

            // Username-Entity (GitHub-Login)
            discovered.push({
                kind: "username",
                primaryValue: p.login,
                displayName: p.login,
                data: {
                    value: p.login,
                    normalized: p.login.toLowerCase(),
                    observedPlatforms: ["github"],
                    linkedEmail: p.email,
                    profileUrl: p.profileUrl,
                },
                relationshipToRoot: {
                    kind: "linked_to",
                    direction: "from_root_to_discovered",
                    confidence: 60,
                },
                source: "osint_github_personnel",
            });

            // Email-Entity nur wenn public + auf der Ziel-Domain.
            if (p.email && p.email.endsWith(`@${domain}`)) {
                discovered.push({
                    kind: "email_address",
                    primaryValue: p.email,
                    displayName: p.email,
                    data: {
                        local: p.email.split("@")[0],
                        domain,
                        linkedGithubLogin: p.login,
                        discoveredVia: "github_personnel",
                    },
                    relationshipToRoot: {
                        kind: "email_of_domain",
                        direction: "from_root_to_discovered",
                        confidence: 95,
                    },
                    source: "osint_github_personnel",
                });
            }
        }

        const findings: FindingDraft[] = [];
        if (personnel.length > 0) {
            const emailsCount = personnel.filter((p) => p.email && p.email.endsWith(`@${domain}`)).length;
            findings.push({
                fingerprintInputs: ["osint_github_personnel", domain, personnel.map((p) => p.login).sort().join(",")],
                severity: "info",
                category: "exposure",
                title: `${personnel.length} GitHub-User mit Bezug zu ${domain}`,
                description: `Über die GitHub-Search-API wurden ${personnel.length} User mit Email auf ${domain} entdeckt — ${emailsCount} davon haben ihre Email öffentlich auf dem Profil. Das ist ein typischer Personalisierungsvektor für Spear-Phishing.`,
                evidence: {
                    domain,
                    logins: personnel.map((p) => p.login),
                    publicEmails: personnel.filter((p) => p.email && p.email.endsWith(`@${domain}`)).map((p) => p.email),
                },
            });
        }

        return {
            success: true,
            rawOutput: { domain, hitsTotal: userHits.length, detailsFetched: personnel.length },
            findings,
            discoveredEntities: discovered,
            durationMs: Date.now() - start,
        };
    },
};

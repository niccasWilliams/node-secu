// Sprint 3 (OSINT-Engine, features.md §3.3 #29a + Live-Test L13) — domain_github_brand.
//
// Input:  asset_domain
// Sucht GitHub-User per Brand-Variants des SLD + per Operator-Hints (ownerNames,
// ownerCompanies, ownerKnownUsernames). Persistiert pro Hit:
//   - social_account (kind=social_account, discriminator=github)
//   - username (kind=username, observedPlatforms=['github']) — Cross-Platform-Bridge
//
// Bewusst NICHT: ein Personen-Entity erzeugen. Der GitHub-Profil-Owner ist nicht
// notwendig eine Person dieses Engagements (Brand-Match heißt Username-Match,
// nicht Identitätsbeweis). Person-Discovery passiert eine Hop später durch
// `github_events_public`, der echte commit-author-emails extrahiert.
//
// Provenance (features.md §2.7):
//   - Queries aus SLD-Variants  → evidenceClass="organic"
//   - Queries aus Hints         → evidenceClass="hint_seeded" + hintRefs[]
//
// Quota: GitHub /search/users hat 30/min hard-cap (auch mit Token, eigene Sub-
// Quota). Wir issuen 2-7 Queries/Run je nach Hint-Volumen. Hydration via
// /users/{login} läuft auf "github-token" (5000/h).
//
// Live-Test-Anker: niccaswilliams.com → SLD "niccaswilliams" → exact in:login
// match → User `niccasWilliams` (id 156859625). Smoke-Test im Phase-Abschluss.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";
import { osintHttp } from "../../osint/osint-http";
import {
    extractSld,
    sldVariants,
    personNameVariants,
    companyNameVariants,
} from "../../osint/brand-variants";
import { hintService } from "../../hints/hint.service";

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
    followers?: number;
    created_at?: string;
    html_url?: string;
}

/** Eine Suchanfrage gegen /search/users, klassifiziert nach Provenance-Klasse. */
interface BrandQuery {
    /** Roher q-Parameter — z.B. "niccaswilliams in:login" oder "\"Niclas Pilz\"". */
    q: string;
    /**
     * Confidence-Beitrag für ALLE Hits dieser Query.
     * Reihenfolge im Worker: SLD exact-in-login=0.7, SLD broad=0.4,
     * known-username-hint=0.85, name-hint=0.5, company-hint=0.5.
     */
    contribution: number;
    evidenceClass: "organic" | "hint_seeded";
    hintRefs?: number[];
    /** Operator-readable Beschreibung. Landet in evidence[].snippet. */
    label: string;
}

function authHeaders(token: string): Record<string, string> {
    return {
        "User-Agent": "node-secu-osint/3.0",
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
    };
}

export const domainGithubBrandWorker: SecurityWorker = {
    jobKey: "domain_github_brand",
    requiredScope: "passive_only",
    description:
        "Findet GitHub-User per SLD-Brand-Match und Operator-Hints (ownerNames, " +
        "ownerCompanies, ownerKnownUsernames). Liefert social_account + username " +
        "mit Provenance-getrennter Evidence (organic vs hint_seeded).",
    defaultTimeoutMs: 90_000,

    isApplicable(target) {
        return target.kind === "asset_domain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const domain = ctx.target.value.trim().toLowerCase();
        const token = process.env.GH_TOKEN;
        const searchKey = "github-search-users";

        if (!token) {
            return {
                success: true,
                findings: [],
                error: "skipped:gh_token_missing",
                durationMs: Date.now() - start,
            };
        }

        const sld = extractSld(domain);
        if (!sld) {
            return {
                success: true,
                findings: [],
                error: "skipped:no_sld_extractable",
                durationMs: Date.now() - start,
            };
        }

        // 1) Query-Plan zusammenstellen — organisch + hint-seeded.
        const queries: BrandQuery[] = [];

        // SLD-Variants → organic.
        const sldVars = sldVariants(sld);
        for (const v of sldVars) {
            queries.push({
                q: `${v} in:login`,
                contribution: 0.7,
                evidenceClass: "organic",
                label: `sld_in_login:${v}`,
            });
        }
        // Eine breite Suche zusätzlich — fängt Bio-/Name-Treffer.
        queries.push({
            q: sld,
            contribution: 0.4,
            evidenceClass: "organic",
            label: `sld_broad:${sld}`,
        });

        // Hint-getriebene Queries — nur wenn engagementId vorhanden ist.
        if (ctx.engagementId != null) {
            try {
                const bundle = await hintService.getBundle(ctx.engagementId);

                for (const h of bundle.owner_known_username) {
                    queries.push({
                        q: `${h.value} in:login`,
                        contribution: 0.85,
                        evidenceClass: "hint_seeded",
                        hintRefs: [h.id],
                        label: `hint_known_username:${h.value}`,
                    });
                }
                for (const h of bundle.owner_name) {
                    for (const v of personNameVariants(h.value)) {
                        queries.push({
                            q: `${v} in:login`,
                            contribution: 0.5,
                            evidenceClass: "hint_seeded",
                            hintRefs: [h.id],
                            label: `hint_name_variant:${v}`,
                        });
                    }
                    // Eine breite Name-Phrase-Suche — matcht Profil-Display-Name.
                    queries.push({
                        q: `"${h.value.replace(/"/g, "")}"`,
                        contribution: 0.5,
                        evidenceClass: "hint_seeded",
                        hintRefs: [h.id],
                        label: `hint_name_phrase:${h.value}`,
                    });
                }
                for (const h of bundle.owner_company) {
                    for (const v of companyNameVariants(h.value)) {
                        queries.push({
                            q: `${v} in:login`,
                            contribution: 0.5,
                            evidenceClass: "hint_seeded",
                            hintRefs: [h.id],
                            label: `hint_company_variant:${v}`,
                        });
                    }
                }
            } catch (err) {
                console.warn(`[domain_github_brand] hint bundle load failed: ${(err as Error).message}`);
            }
        }

        // Hard-Cap auf 12 Queries — 6 GitHub-Search-Subquota-Calls + Buffer.
        // Reihenfolge bleibt erhalten (priorisierte SLD zuerst, danach Hints).
        const cappedQueries = dedupeQueries(queries).slice(0, 12);

        // 2) Pro Query searchen, Hits sammeln. Aggregiert pro Login (hits-Map),
        //    so dass mehrere matchende Queries die Confidence multi-source-boosten.
        type HitContext = {
            hit: GitHubUserHit;
            evidences: Array<{
                source: string;
                snippet: string;
                contribution: number;
                evidenceClass: "organic" | "hint_seeded";
                hintRefs?: number[];
                queryLabel: string;
            }>;
        };
        const byLogin = new Map<string, HitContext>();
        let queriesIssued = 0;
        let providerPaused = false;

        for (const q of cappedQueries) {
            if (ctx.abortSignal?.aborted) break;
            if (providerPaused) break;

            const release = await acquireProvider(searchKey, { abortSignal: ctx.abortSignal });
            try {
                const res = await osintHttp.client().get<UsersSearchResponse>(
                    "https://api.github.com/search/users",
                    {
                        timeout: 15_000,
                        signal: ctx.abortSignal,
                        params: { q: q.q, per_page: 5 },
                        headers: authHeaders(token),
                        validateStatus: () => true,
                    },
                );
                queriesIssued += 1;

                if (res.status === 429 || res.status === 403) {
                    await markProvider429(searchKey, `gh search-users ${res.status}`);
                    providerPaused = true;
                    continue;
                }
                if (res.status === 422) {
                    // Malformed Query — z.B. zu viele Sonderzeichen. Nicht-fatal.
                    markProviderSuccess(searchKey);
                    continue;
                }
                if (res.status !== 200) continue;
                markProviderSuccess(searchKey);

                const items = res.data?.items ?? [];
                for (const hit of items) {
                    if (!hit.login) continue;
                    const key = hit.login.toLowerCase();
                    const cur = byLogin.get(key) ?? { hit, evidences: [] };
                    cur.evidences.push({
                        source: q.label,
                        snippet: `query=${q.q}; matched login=${hit.login}`,
                        contribution: q.contribution,
                        evidenceClass: q.evidenceClass,
                        hintRefs: q.hintRefs,
                        queryLabel: q.label,
                    });
                    byLogin.set(key, cur);
                }
            } finally {
                release();
            }
        }

        // 3) Hits Hydrieren — Profil-Detail für Top-N. Hard-Cap 8 (gegen
        //    Quota-Verbrauch bei breiten Suchergebnissen).
        const hydrationOrder = [...byLogin.entries()]
            .sort((a, b) => b[1].evidences.length - a[1].evidences.length)
            .slice(0, 8);

        type Hydrated = {
            login: string;
            details?: GitHubUserDetail;
            ctx: HitContext;
        };
        const hydrated: Hydrated[] = [];
        const detailKey = "github-token";

        for (const [, hctx] of hydrationOrder) {
            if (ctx.abortSignal?.aborted) break;
            const login = hctx.hit.login!;
            const release = await acquireProvider(detailKey, { abortSignal: ctx.abortSignal });
            try {
                const detailRes = await osintHttp.client().get<GitHubUserDetail>(
                    `https://api.github.com/users/${encodeURIComponent(login)}`,
                    {
                        timeout: 10_000,
                        signal: ctx.abortSignal,
                        headers: authHeaders(token),
                        validateStatus: () => true,
                    },
                );
                if (detailRes.status === 429 || detailRes.status === 403) {
                    await markProvider429(detailKey, `gh users ${detailRes.status}`);
                    hydrated.push({ login, ctx: hctx });
                    break;
                }
                if (detailRes.status === 200) {
                    markProviderSuccess(detailKey);
                    hydrated.push({ login, details: detailRes.data, ctx: hctx });
                } else {
                    hydrated.push({ login, ctx: hctx });
                }
            } catch {
                hydrated.push({ login, ctx: hctx });
            } finally {
                release();
            }
        }

        // 4) Discovered-Entities + Findings bauen.
        const discovered: DiscoveredEntityDraft[] = [];
        const findings: FindingDraft[] = [];
        const sldExact = sld.toLowerCase();

        for (const h of hydrated) {
            const login = h.login;
            const profileUrl = h.details?.html_url ?? `https://github.com/${login}`;

            // Pro Hit: alle Query-Evidence-Items mappen.
            const evidence = h.ctx.evidences.map((e) => ({
                source: e.source,
                snippet: e.snippet,
                confidenceContribution: e.contribution,
                evidenceClass: e.evidenceClass,
                hintRefs: e.hintRefs,
            }));

            // Heuristik: wenn login exakt zum SLD passt + Profil ist nicht leer
            // (followers>=1 ODER public_repos>=1 ODER bio/name gesetzt) → strong
            // organic signal. Wir setzen `speculativeOverride=false` nur in
            // diesem Fall — sonst entscheidet der Confidence-Service.
            const exactSldMatch = login.toLowerCase() === sldExact;
            const profileIsLive =
                (h.details?.public_repos ?? 0) >= 1 ||
                (h.details?.followers ?? 0) >= 1 ||
                Boolean(h.details?.bio) ||
                Boolean(h.details?.name);
            const speculativeOverride = exactSldMatch && profileIsLive ? false : undefined;

            // social_account-Entity (Plattform-spezifisch, GitHub).
            discovered.push({
                kind: "social_account",
                primaryValue: login,
                discriminator: "github",
                displayName: h.details?.name ? `${h.details.name} (gh:${login})` : `github:${login}`,
                data: {
                    platform: "github",
                    handle: login,
                    profileUrl,
                    name: h.details?.name ?? null,
                    profileEmail: h.details?.email ?? null,
                    profileCompany: h.details?.company ?? null,
                    profileLocation: h.details?.location ?? null,
                    profileBio: h.details?.bio ?? null,
                    publicRepos: h.details?.public_repos ?? null,
                    followers: h.details?.followers ?? null,
                    createdAt: h.details?.created_at ?? null,
                    discoveredVia: "github_brand_search",
                    discoveredFromDomain: domain,
                    discoveredFromSld: sld,
                },
                relationshipToRoot: {
                    kind: "brand_associated_with",
                    direction: "from_root_to_discovered",
                    confidence: exactSldMatch ? 90 : 60,
                },
                source: "domain_github_brand",
                evidence,
                speculativeOverride,
            });

            // Cross-Platform-Bridge: username-Entity (für spätere Sherlock/HN/Reddit-Folgesuchen).
            discovered.push({
                kind: "username",
                primaryValue: login,
                displayName: login,
                data: {
                    value: login,
                    normalized: login.toLowerCase(),
                    observedPlatforms: ["github"],
                    profileUrl,
                    discoveredVia: "github_brand_search",
                    discoveredFromDomain: domain,
                },
                relationshipToRoot: {
                    kind: "brand_associated_with",
                    direction: "from_root_to_discovered",
                    confidence: exactSldMatch ? 80 : 50,
                },
                source: "domain_github_brand",
                evidence,
                speculativeOverride,
            });

            // Wenn Profil-Email gesetzt ist, Email-Entity ableiten — markiert
            // mit Provenance, weil die Email eine Brand-Match-Folge ist und nicht
            // direkt am Customer-Domain hängt. speculative bleibt confidence-driven.
            const profileEmail = h.details?.email?.toLowerCase().trim();
            if (profileEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail)) {
                discovered.push({
                    kind: "email_address",
                    primaryValue: profileEmail,
                    displayName: profileEmail,
                    data: {
                        local: profileEmail.split("@")[0],
                        domain: profileEmail.split("@")[1],
                        linkedGithubLogin: login,
                        discoveredVia: "github_brand_search",
                    },
                    relationshipToRoot: {
                        kind: "linked_via_github_brand",
                        direction: "from_root_to_discovered",
                        confidence: 60,
                    },
                    source: "domain_github_brand",
                    evidence,
                });
            }
        }

        if (hydrated.length > 0) {
            const exactCount = hydrated.filter((h) => h.login.toLowerCase() === sldExact).length;
            findings.push({
                fingerprintInputs: [
                    "domain_github_brand",
                    domain,
                    hydrated.map((h) => h.login).sort().join(","),
                ],
                severity: "info",
                category: "exposure",
                title: `${hydrated.length} GitHub-User per Brand-Match zu ${domain}`,
                description:
                    `Brand-Match (SLD '${sld}'${ctx.engagementId != null ? " + Hints" : ""}) lieferte ` +
                    `${hydrated.length} GitHub-User-Kandidat(en); ${exactCount} matchen den SLD exakt im Login. ` +
                    `Hits wurden als social_account (discriminator=github) + username persistiert. ` +
                    `Folge-Worker github_repos_public + github_events_public reichern Repos und ` +
                    `Commit-Author-Emails an.`,
                evidence: {
                    domain,
                    sld,
                    queriesIssued,
                    queriesPlanned: cappedQueries.length,
                    hits: hydrated.map((h) => ({
                        login: h.login,
                        publicRepos: h.details?.public_repos ?? null,
                        followers: h.details?.followers ?? null,
                        exactSldMatch: h.login.toLowerCase() === sldExact,
                    })),
                },
            });
        }

        return {
            success: true,
            rawOutput: {
                domain,
                sld,
                queriesPlanned: cappedQueries.length,
                queriesIssued,
                hitsTotal: byLogin.size,
                hydrated: hydrated.length,
                providerPaused,
            },
            findings,
            discoveredEntities: discovered,
            durationMs: Date.now() - start,
        };
    },
};

/**
 * Dedupliziert Queries by `q`-String, behält die höchste Confidence-Klasse zuerst.
 * Wenn dieselbe Query sowohl als organic als auch hint_seeded vorkommt, gewinnt
 * die zuerst angefügte (Reihenfolge im Caller: organic kommen zuerst).
 */
function dedupeQueries(qs: BrandQuery[]): BrandQuery[] {
    const seen = new Set<string>();
    const out: BrandQuery[] = [];
    for (const q of qs) {
        if (seen.has(q.q)) continue;
        seen.add(q.q);
        out.push(q);
    }
    return out;
}

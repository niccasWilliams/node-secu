// Sprint 3 (OSINT-Engine, features.md §3.3 #29c + Live-Test L13) — github_events_public.
//
// Input:  social_account mit data.platform="github" und data.handle=<login>
// Output: Pro distinct Commit-Author-Email aus den letzten ~30 öffentlichen
//         PushEvents → email_address-Entity (linked_via_github_commit). Trennt
//         drei Kategorien:
//           - personal:  z.B. "name@gmail.com"      → speculative=false (sehr stark)
//           - corporate: "name@<root-customer-domain>" → speculative=false
//           - github_noreply: "12345+login@users.noreply.github.com" → speculative=true
//             (interessant als Korrelations-Anker, aber kein direkter Vektor)
//
// Diese Email-Discovery ist der eigentliche Wert von Sprint 3 #29c: GitHub-Profile
// haben oft leere Profile-Email, die echte Privatemail leakt aber im Commit-
// Author-Header. Live-Test-Ziel ist niccasWilliams → events listet Commit-Author
// Emails der Operator-Identität.
//
// Quelle: GET /users/{login}/events/public?per_page=100
// Auth:   GH_TOKEN auf Provider-Limiter "github-token" (5000/h).
//
// Provenance: alle gefundenen Emails sind Worker-Discovery → evidenceClass=organic
// (Hint-Bias spielt keine Rolle — wir lesen nur was im Commit-Header steht).

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";
import { osintHttp } from "../../osint/osint-http";
import { database } from "@/db";
import { entities } from "@/db/individual/individual-schema";
import { eq } from "drizzle-orm";

interface GitHubCommitInline {
    sha?: string;
    message?: string;
    author?: { email?: string; name?: string };
}

interface GitHubEvent {
    id?: string;
    type?: string;
    created_at?: string;
    repo?: { name?: string };
    payload?: {
        commits?: GitHubCommitInline[];
        ref?: string;
        head?: string;
    };
}

const NOREPLY_RE = /^[0-9]+\+[a-z0-9-]+@users\.noreply\.github\.com$/i;
const GENERIC_NOREPLY_RE = /^[a-z0-9-]+@users\.noreply\.github\.com$/i;
const VALID_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authHeaders(token: string): Record<string, string> {
    return {
        "User-Agent": "node-secu-osint/3.0",
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
    };
}

interface EmailAggregate {
    email: string;
    kind: "personal" | "corporate" | "github_noreply";
    commitCount: number;
    repos: Set<string>;
    firstSeen?: string;
    lastSeen?: string;
    sampleSubject?: string;
    authorNames: Set<string>;
}

export const githubEventsPublicWorker: SecurityWorker = {
    jobKey: "github_events_public",
    requiredScope: "passive_only",
    description:
        "Mined Commit-Author-Emails aus den ~30 letzten public PushEvents eines " +
        "GitHub-Users. Liefert email_address-Entities, kategorisiert in personal " +
        "/ corporate / github_noreply.",
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
        // discoveredFromDomain wird vom Brand-Worker gesetzt; benutzt um
        // Corporate-vs-Personal-Klassifikation zu schärfen.
        const customerDomain = typeof data.discoveredFromDomain === "string"
            ? data.discoveredFromDomain.toLowerCase()
            : null;

        const providerKey = "github-token";
        const release = await acquireProvider(providerKey, { abortSignal: ctx.abortSignal });
        let events: GitHubEvent[] = [];
        try {
            const res = await osintHttp.client().get<GitHubEvent[]>(
                `https://api.github.com/users/${encodeURIComponent(handle)}/events/public`,
                {
                    timeout: 15_000,
                    signal: ctx.abortSignal,
                    params: { per_page: 100 },
                    headers: authHeaders(token),
                    validateStatus: () => true,
                },
            );
            if (res.status === 429 || res.status === 403) {
                await markProvider429(providerKey, `gh events ${res.status}`);
                return {
                    success: true,
                    findings: [],
                    error: `provider_paused:${providerKey}`,
                    durationMs: Date.now() - start,
                };
            }
            if (res.status === 404) {
                markProviderSuccess(providerKey);
                return {
                    success: true,
                    rawOutput: { handle, status: 404 },
                    findings: [],
                    durationMs: Date.now() - start,
                };
            }
            if (res.status !== 200) {
                return {
                    success: false,
                    findings: [],
                    error: `github_events_failed:${res.status}`,
                    durationMs: Date.now() - start,
                };
            }
            markProviderSuccess(providerKey);
            events = Array.isArray(res.data) ? res.data : [];
        } finally {
            release();
        }

        // Aggregation pro Email.
        const byEmail = new Map<string, EmailAggregate>();
        let totalCommitsSeen = 0;

        for (const ev of events) {
            if (ev.type !== "PushEvent") continue;
            const repoName = ev.repo?.name;
            const ts = ev.created_at;
            const commits = ev.payload?.commits ?? [];
            for (const c of commits) {
                totalCommitsSeen += 1;
                const rawEmail = c.author?.email?.trim().toLowerCase();
                const authorName = c.author?.name?.trim();
                if (!rawEmail || !VALID_EMAIL_RE.test(rawEmail)) continue;

                const kind = classifyEmail(rawEmail, customerDomain);
                let agg = byEmail.get(rawEmail);
                if (!agg) {
                    agg = {
                        email: rawEmail,
                        kind,
                        commitCount: 0,
                        repos: new Set(),
                        authorNames: new Set(),
                    };
                    byEmail.set(rawEmail, agg);
                }
                agg.commitCount += 1;
                if (repoName) agg.repos.add(repoName);
                if (authorName) agg.authorNames.add(authorName);
                if (ts) {
                    if (!agg.firstSeen || ts < agg.firstSeen) agg.firstSeen = ts;
                    if (!agg.lastSeen || ts > agg.lastSeen) agg.lastSeen = ts;
                }
                if (!agg.sampleSubject && c.message) {
                    agg.sampleSubject = c.message.split("\n")[0].slice(0, 200);
                }
            }
        }

        // Discovered Entities + zusammenfassendes Finding aufbauen.
        const discovered: DiscoveredEntityDraft[] = [];
        for (const agg of byEmail.values()) {
            // Confidence-Mapping: ein Treffer aus einem Commit-Header ist faktisch
            // (steht im Commit), aber WER der Owner ist, ist davon getrennt:
            //   - personal/corporate: speculative=false (echte Adresse bestätigt)
            //   - github_noreply:     speculative=true  (Identitäts-Anker, nicht Vektor)
            const speculativeOverride = agg.kind === "github_noreply" ? true : false;
            const contribution = agg.kind === "github_noreply" ? 0.4 : 0.7;

            discovered.push({
                kind: "email_address",
                primaryValue: agg.email,
                displayName: agg.email,
                data: {
                    local: agg.email.split("@")[0],
                    domain: agg.email.split("@")[1],
                    discoveredVia: "github_events_public",
                    discoveredKind: agg.kind,
                    linkedGithubLogin: handle,
                    commitCount: agg.commitCount,
                    repos: [...agg.repos].slice(0, 10),
                    authorNames: [...agg.authorNames].slice(0, 5),
                    firstSeen: agg.firstSeen,
                    lastSeen: agg.lastSeen,
                    sampleSubject: agg.sampleSubject,
                },
                relationshipToRoot: {
                    kind: "email_used_in_github_commits",
                    direction: "from_root_to_discovered",
                    confidence: agg.kind === "github_noreply" ? 70 : 95,
                },
                source: "github_events_public",
                evidence: [{
                    source: `github_events_public:${agg.kind}`,
                    snippet: agg.sampleSubject
                        ? `commit by ${[...agg.authorNames][0] ?? handle}: "${agg.sampleSubject}"`
                        : `${agg.commitCount} commit(s) by ${[...agg.authorNames][0] ?? handle}`,
                    confidenceContribution: contribution,
                    evidenceClass: "organic",
                }],
                speculativeOverride,
            });
        }

        const findings: FindingDraft[] = [];
        if (byEmail.size > 0) {
            const personal = [...byEmail.values()].filter((a) => a.kind === "personal");
            const corporate = [...byEmail.values()].filter((a) => a.kind === "corporate");
            const noreply = [...byEmail.values()].filter((a) => a.kind === "github_noreply");
            findings.push({
                fingerprintInputs: [
                    "github_events_public",
                    handle,
                    [...byEmail.keys()].sort().join(","),
                ],
                severity: "info",
                category: "exposure",
                title: `${byEmail.size} Commit-Author-Email(s) aus public PushEvents von gh:${handle}`,
                description:
                    `${personal.length} privat (z.B. ${personal[0]?.email ?? "—"}), ` +
                    `${corporate.length} corporate (Customer-Domain ${customerDomain ?? "n/a"}), ` +
                    `${noreply.length} github-noreply. Privat-/Corporate-Adressen sind direkt ` +
                    `verwertbare Identitäts- und Phishing-Vektoren — ohne dass die GitHub-` +
                    `Profil-Email öffentlich war.`,
                evidence: {
                    handle,
                    customerDomain,
                    totalCommitsScanned: totalCommitsSeen,
                    eventsConsidered: events.length,
                    personal: personal.map((a) => a.email),
                    corporate: corporate.map((a) => a.email),
                    noreply: noreply.map((a) => a.email),
                },
            });
        }

        return {
            success: true,
            rawOutput: {
                handle,
                eventsConsidered: events.length,
                commitsSeen: totalCommitsSeen,
                emailsFound: byEmail.size,
            },
            findings,
            discoveredEntities: discovered,
            durationMs: Date.now() - start,
        };
    },
};

function classifyEmail(
    email: string,
    customerDomain: string | null,
): "personal" | "corporate" | "github_noreply" {
    if (NOREPLY_RE.test(email) || GENERIC_NOREPLY_RE.test(email)) return "github_noreply";
    if (customerDomain) {
        const at = email.split("@");
        const dom = at[1]?.toLowerCase();
        if (dom === customerDomain || (dom && dom.endsWith(`.${customerDomain}`))) {
            return "corporate";
        }
    }
    return "personal";
}

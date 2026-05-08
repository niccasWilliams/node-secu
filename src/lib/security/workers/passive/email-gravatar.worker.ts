// Phase 2.7 — email_gravatar Worker.
//
// Input:  email_address-Entity
// Output: Wenn Gravatar-Profil existiert: discoveredEntity (kind=social_account,
//         platform=gravatar) + Relationship "owns_social_account" vom Email-Entity.
//
// Quelle: api.gravatar.com, MD5(lowercased+trimmed email).
// Gravatar API liefert JSON oder 404. Kein Auth nötig, sehr toleranter CDN.

import crypto from "node:crypto";
import axios from "axios";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";

interface GravatarProfile {
    profileUrl?: string;
    preferredUsername?: string;
    displayName?: string;
    aboutMe?: string;
    accounts?: Array<{ shortname?: string; url?: string; username?: string }>;
}

export const emailGravatarWorker: SecurityWorker = {
    jobKey: "email_gravatar",
    requiredScope: "passive_only",
    description: "Gravatar-Profil-Lookup via MD5(lowercased email) — public CDN, kein Auth.",
    defaultTimeoutMs: 10_000,

    isApplicable(target) {
        return target.kind === "email_address";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const email = ctx.target.value.trim().toLowerCase();
        const md5 = crypto.createHash("md5").update(email).digest("hex");
        const url = `https://www.gravatar.com/${md5}.json`;

        const release = await acquireProvider("gravatar", { abortSignal: ctx.abortSignal });
        try {
            const res = await axios.get(url, {
                timeout: 8_000,
                signal: ctx.abortSignal,
                validateStatus: (s) => s < 500, // 404 ist erwartet wenn kein Profil
                headers: { "User-Agent": "node-secu-osint/2.7" },
            });
            markProviderSuccess("gravatar");

            if (res.status === 404) {
                return {
                    success: true,
                    rawOutput: { gravatarHash: md5, found: false },
                    findings: [],
                    durationMs: Date.now() - start,
                };
            }

            if (res.status !== 200 || !res.data) {
                return {
                    success: true,
                    rawOutput: { gravatarHash: md5, found: false, status: res.status },
                    findings: [],
                    durationMs: Date.now() - start,
                };
            }

            const entry = (res.data?.entry as GravatarProfile[] | undefined)?.[0];
            if (!entry || !entry.profileUrl) {
                return {
                    success: true,
                    rawOutput: { gravatarHash: md5, found: false, raw: res.data },
                    findings: [],
                    durationMs: Date.now() - start,
                };
            }

            const profileUrl = entry.profileUrl;
            const handle = entry.preferredUsername ?? handleFromUrl(profileUrl) ?? md5;

            const discovered: DiscoveredEntityDraft[] = [{
                kind: "social_account",
                primaryValue: handle,
                discriminator: "gravatar",
                displayName: entry.displayName ?? `gravatar:${handle}`,
                data: {
                    platform: "gravatar",
                    handle,
                    profileUrl,
                    displayName: entry.displayName ?? null,
                    bio: entry.aboutMe ?? null,
                },
                relationshipToRoot: {
                    kind: "owns_social_account",
                    direction: "from_root_to_discovered",
                    confidence: 95,
                },
                source: "osint_gravatar",
            }];

            // Wenn Gravatar-Profil verlinkte Accounts hat (twitter, github, …), als
            // weitere social_account-Drafts entdecken — der GOLDENE Cross-Identity-Hit.
            for (const acc of entry.accounts ?? []) {
                if (!acc.shortname || !acc.url) continue;
                const accHandle = acc.username ?? handleFromUrl(acc.url) ?? acc.url;
                discovered.push({
                    kind: "social_account",
                    primaryValue: accHandle,
                    discriminator: acc.shortname,
                    displayName: `${acc.shortname}:${accHandle}`,
                    data: {
                        platform: acc.shortname,
                        handle: accHandle,
                        profileUrl: acc.url,
                        verifiedVia: "gravatar_linked",
                    },
                    relationshipToRoot: {
                        kind: "owns_social_account",
                        direction: "from_root_to_discovered",
                        confidence: 80,
                    },
                    source: "osint_gravatar_linked",
                });
            }

            const findings: FindingDraft[] = [{
                fingerprintInputs: ["osint_gravatar", "found", email],
                severity: "info",
                category: "exposure",
                title: `Gravatar-Profil gefunden für ${email}`,
                description: `Email hat öffentliches Gravatar-Profil${entry.displayName ? ` (${entry.displayName})` : ""}${entry.accounts?.length ? ` mit ${entry.accounts.length} verknüpften Social-Accounts` : ""}.`,
                evidence: { profileUrl, gravatarHash: md5, linkedAccounts: entry.accounts?.map((a) => a.shortname).filter(Boolean) ?? [] },
            }];

            return {
                success: true,
                rawOutput: { gravatarHash: md5, found: true, entry },
                findings,
                discoveredEntities: discovered,
                durationMs: Date.now() - start,
            };
        } catch (err: unknown) {
            const e = err as { response?: { status?: number }; message?: string };
            if (e.response?.status === 429) {
                await markProvider429("gravatar", e.message);
                return {
                    success: true,
                    findings: [],
                    error: "provider_paused:gravatar (rate-limited)",
                    durationMs: Date.now() - start,
                };
            }
            return {
                success: false,
                findings: [],
                error: e.message ?? "gravatar_fetch_failed",
                durationMs: Date.now() - start,
            };
        } finally {
            release();
        }
    },
};

function handleFromUrl(url: string): string | null {
    try {
        const u = new URL(url);
        const segments = u.pathname.split("/").filter(Boolean);
        return segments[segments.length - 1] ?? null;
    } catch {
        return null;
    }
}

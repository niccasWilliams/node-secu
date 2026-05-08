// Phase 2.7 — social_account_validate Worker.
//
// Input:  social_account-Entity (data.profileUrl muss gesetzt sein)
// Output: entityDataPatch { lastSeenAt, profileReachable, statusCode, displayName?,
//         bio? } — KEINE neuen Entities, KEINE Findings.
//
// Idee: schneller Reachability-Check + minimaler HTML-Title/Meta-Extract aus dem
// HEAD/GET-Response. Pro Plattform throttled über Provider-Limiter (Key
// "social-validate-{platform}", requiresProxy=true via prefix-config).

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

function pickTitle(html: string): string | undefined {
    const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    return m?.[1]?.trim();
}

function pickMetaContent(html: string, name: string): string | undefined {
    const re = new RegExp(`<meta[^>]+(?:name|property)="${name}"[^>]+content="([^"]+)"`, "i");
    const m = re.exec(html);
    return m?.[1]?.trim();
}

export const socialAccountValidateWorker: SecurityWorker = {
    jobKey: "social_account_validate",
    requiredScope: "passive_only",
    description: "Reachability + Profil-Metadaten-Extract pro social_account-Entity. Schreibt lastSeenAt + displayName/bio via entityDataPatch.",
    defaultTimeoutMs: 12_000,

    isApplicable(target) {
        return target.kind === "social_account";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const sourceId = typeof ctx.target.id === "string" ? Number(ctx.target.id) : ctx.target.id;
        if (!Number.isFinite(sourceId) || sourceId <= 0) {
            return { success: false, findings: [], error: "social_validate_invalid_source", durationMs: Date.now() - start };
        }

        const [row] = await database.select().from(entities).where(eq(entities.id, sourceId)).limit(1);
        if (!row) {
            return { success: false, findings: [], error: "social_validate_source_not_found", durationMs: Date.now() - start };
        }
        const data = (row.data ?? {}) as Record<string, unknown>;
        const profileUrl = typeof data.profileUrl === "string" ? data.profileUrl : null;
        const platform = typeof data.platform === "string" ? data.platform : "unknown";
        if (!profileUrl) {
            return { success: true, findings: [], error: "social_validate_no_profile_url", durationMs: Date.now() - start };
        }

        const providerKey = `social-validate-${platform.replace(/[^a-z0-9_-]/gi, "_")}`;
        const gate = osintHttp.gate(providerKey);
        if (gate.skipped) {
            return { success: true, findings: [], error: gate.reason, durationMs: Date.now() - start };
        }

        const release = await acquireProvider(providerKey, { abortSignal: ctx.abortSignal });
        try {
            const res = await gate.client.get<string>(profileUrl, {
                timeout: 8_000,
                signal: ctx.abortSignal,
                validateStatus: () => true,
                responseType: "text",
                maxRedirects: 3,
                transformResponse: (d) => d, // nicht JSON-parsen, wir wollen Roh-HTML
            });
            if (res.status === 429 || res.status === 503) {
                await markProvider429(providerKey, `${platform} ${res.status}`);
                return { success: true, findings: [], error: `provider_paused:${providerKey}`, durationMs: Date.now() - start };
            }
            const reachable = res.status >= 200 && res.status < 400;
            if (reachable) markProviderSuccess(providerKey);

            const html = typeof res.data === "string" ? res.data : "";
            const title = reachable ? pickTitle(html) : undefined;
            const ogTitle = reachable ? pickMetaContent(html, "og:title") : undefined;
            const ogDescription = reachable ? pickMetaContent(html, "og:description") : undefined;

            const patch: Record<string, unknown> = {
                profileReachable: reachable,
                lastReachabilityCheck: new Date().toISOString(),
                statusCode: res.status,
            };
            if (reachable) {
                patch.lastSeenAt = new Date().toISOString();
                if (ogTitle ?? title) patch.displayName = (ogTitle ?? title)?.slice(0, 256);
                if (ogDescription) patch.bio = ogDescription.slice(0, 512);
            }

            return {
                success: true,
                rawOutput: { profileUrl, platform, statusCode: res.status, reachable },
                findings: [],
                entityDataPatch: patch,
                durationMs: Date.now() - start,
            };
        } catch (err: unknown) {
            const e = err as { response?: { status?: number }; message?: string; code?: string };
            if (e.response?.status === 429 || e.response?.status === 403) {
                await markProvider429(providerKey, e.message);
                return { success: true, findings: [], error: `provider_paused:${providerKey}`, durationMs: Date.now() - start };
            }
            return {
                success: true,
                rawOutput: { profileUrl, platform, error: e.message ?? "unknown" },
                findings: [],
                entityDataPatch: {
                    profileReachable: false,
                    lastReachabilityCheck: new Date().toISOString(),
                    statusCode: 0,
                    error: e.message ?? "fetch_failed",
                },
                durationMs: Date.now() - start,
            };
        } finally {
            release();
        }
    },
};

// Sprint 2 #11 (OSINT-Engine, features.md §3.2 Mechanik #12-#16c) — HTML-
// Pivots-Extractor.
//
// Holt die Index-Page der Domain via http-fetch (UA-rotation gegen WAF), parst
// alle bekannten Tracking-IDs + Build-Asset-Hashes raus, persistiert in
// `secu_html_pivots`. Sprint-5-Cross-Domain-Worker liest die Tabelle zurück.
//
// Erkannte Pivots (Stand Sprint 2):
//   - Google Analytics UA-XXXXXXX-Y / G-XXXXXXXXXX
//   - Google Tag Manager GTM-XXXXXXX
//   - Facebook Pixel (fbq init id)
//   - Hotjar / Matomo / Yandex Metrika / Microsoft Clarity Site-IDs
//   - Sentry DSN, Stripe pk_live/pk_test, Mapbox-Token, Mailchimp-List-ID
//   - reCAPTCHA Site-Key
//   - Plausible Domain
//   - Webpack-Chunk-Hash (16-hex), Next.js-Chunk-Hash (16-hex), Vite-Asset-
//     Hash (8-hex), SvelteKit-Chunk-Hash (10-hex)
//
// Cross-Engagement-Sichtbarkeit: nach jedem persistierten Pivot wird gezählt,
// wie viele andere Engagements denselben (idType, idValue)-Pivot kennen.
// Wenn ≥1 Match in einem fremden Engagement, wird ein Finding erstellt:
// "Cross-Domain Pivot Hit" mit den Counterpart-Engagement-IDs (Operator-
// Triage-Material; KEIN automatischer Owner-Pivot).

import { and, eq, ne } from "drizzle-orm";
import { database } from "@/db";
import { htmlPivots } from "@/db/individual/individual-schema";
import { httpFetch } from "../../osint/http-fetch";
import { infrastructureProviderService } from "../../osint/infrastructure-providers/provider.service";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 1_500 * 1024;
const PROBE_PATHS = ["/", "/index.html", "/de", "/en"] as const;

interface PivotMatcher {
    idType: string;
    matcher: RegExp;
    valueGroup: number;
    /** Capture-Set zum Deduplizieren — wenn Pattern mehrfach pro Page matched, nur einmal speichern. */
    multi: "first" | "all";
}

const PIVOT_MATCHERS: ReadonlyArray<PivotMatcher> = [
    { idType: "google_analytics_ua", matcher: /\bUA-\d{4,10}-\d{1,3}\b/g, valueGroup: 0, multi: "all" },
    { idType: "google_analytics_ga4", matcher: /\bG-[A-Z0-9]{10,12}\b/g, valueGroup: 0, multi: "all" },
    { idType: "google_tag_manager", matcher: /\bGTM-[A-Z0-9]{6,9}\b/g, valueGroup: 0, multi: "all" },
    { idType: "facebook_pixel", matcher: /fbq\s*\(\s*['"]init['"]\s*,\s*['"]?(\d{14,17})['"]?/g, valueGroup: 1, multi: "all" },
    { idType: "hotjar", matcher: /hjid\s*[:=]\s*['"]?(\d{6,8})['"]?/g, valueGroup: 1, multi: "first" },
    { idType: "matomo", matcher: /_paq\.push\(\[\s*['"]setSiteId['"]\s*,\s*['"]?(\d+)['"]?/g, valueGroup: 1, multi: "first" },
    { idType: "yandex_metrika", matcher: /ym\(\s*(\d{6,10})\s*,\s*['"]init['"]/g, valueGroup: 1, multi: "first" },
    { idType: "ms_clarity", matcher: /clarity\.ms\/tag\/([a-z0-9]{8,12})/gi, valueGroup: 1, multi: "first" },
    { idType: "sentry_dsn", matcher: /https:\/\/[a-f0-9]{32}@[a-z0-9.-]+\/\d+/gi, valueGroup: 0, multi: "all" },
    { idType: "stripe_publishable_key", matcher: /\bpk_(?:live|test)_[A-Za-z0-9]{20,}\b/g, valueGroup: 0, multi: "all" },
    { idType: "mapbox_token", matcher: /\bpk\.eyJ[A-Za-z0-9+/=._-]{40,}\b/g, valueGroup: 0, multi: "all" },
    { idType: "mailchimp_list_id", matcher: /list-manage\.com\/subscribe\/post.*?[?&]u=([a-z0-9]{16,})&id=([a-z0-9]{8,})/gi, valueGroup: 0, multi: "all" },
    { idType: "recaptcha_site_key", matcher: /['"]?(?:sitekey|data-sitekey|render)['"]?\s*[:=]\s*['"]([A-Za-z0-9_-]{40})['"]/g, valueGroup: 1, multi: "all" },
    { idType: "plausible_domain", matcher: /plausible\.io\/js\/.*?data-domain=['"]([^'"]+)['"]/gi, valueGroup: 1, multi: "first" },
    // Build-Hashes: Webpack/Next/Vite/SvelteKit. Hashes sind base16, oft 8-32 chars.
    // Wir matchen nur, wenn das Hash in einem typischen Build-Pfad steht — sonst
    // kommen False-Positives aus Cache-Buster-Querystrings rein.
    { idType: "next_chunk_hash", matcher: /\/_next\/static\/chunks\/(?:[a-z0-9-]+\/)?([a-f0-9]{16,32})\.(?:js|css)/gi, valueGroup: 1, multi: "all" },
    { idType: "vite_asset_hash", matcher: /\/assets\/[A-Za-z0-9_-]+-([A-Za-z0-9]{8})\.(?:js|css|mjs)/g, valueGroup: 1, multi: "all" },
    { idType: "sveltekit_chunk_hash", matcher: /\/_app\/immutable\/(?:chunks|nodes)\/[A-Za-z0-9_-]+\.([A-Za-z0-9]{8,12})\.js/g, valueGroup: 1, multi: "all" },
    { idType: "webpack_chunk_hash", matcher: /\/static\/js\/[A-Za-z0-9._-]*\.([a-f0-9]{8,16})\.chunk\.js/gi, valueGroup: 1, multi: "all" },
];

interface ExtractedPivot {
    idType: string;
    idValue: string;
}

export const domainHtmlPivotsExtractWorker: SecurityWorker = {
    jobKey: "domain_html_pivots_extract",
    requiredScope: "passive_only",
    description: "Extrahiert Tracking-IDs + Build-Asset-Hashes aus HTML-Body und persistiert sie in secu_html_pivots als Cross-Domain-Pivots.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "domain"
            || target.kind === "asset_subdomain" || target.kind === "subdomain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const target = ctx.target.value.toLowerCase().replace(/\.+$/, "");
        const findings: FindingDraft[] = [];
        const targetEntityId = typeof ctx.target.id === "number" ? ctx.target.id : null;

        const attempted: Array<{ url: string; status: number; bodySize: number; error?: string }> = [];
        let bestBody: { url: string; html: string } | null = null;

        for (const path of PROBE_PATHS) {
            if (ctx.abortSignal?.aborted) break;
            const url = `https://${target}${path}`;
            const res = await httpFetch<string>(url, {
                timeoutMs: FETCH_TIMEOUT_MS,
                signal: ctx.abortSignal,
                providerKey: "html_pivots_crawl",
                responseType: "text",
                maxRedirects: 5,
            });
            attempted.push({ url, status: res.status, bodySize: res.text?.length ?? 0, error: res.error });
            if (!res.success || !res.text) continue;
            // Bevorzuge die Page mit dem grössten HTML — typisch hat sie die meisten Pivot-Inputs.
            if (!bestBody || res.text.length > bestBody.html.length) {
                bestBody = { url, html: res.text.slice(0, MAX_BODY_BYTES) };
            }
        }

        if (!bestBody) {
            return {
                success: false,
                findings: [],
                error: "no_html_response",
                rawOutput: { target, attempted },
                durationMs: Date.now() - start,
            };
        }

        const pivots = extractAll(bestBody.html);

        const persisted: ExtractedPivot[] = [];
        const crossEngagementHits: Array<{ pivot: ExtractedPivot; otherEngagementIds: number[] }> = [];

        if (targetEntityId != null && ctx.engagementId != null) {
            for (const pv of pivots) {
                try {
                    await database
                        .insert(htmlPivots)
                        .values({
                            engagementId: ctx.engagementId,
                            entityId: targetEntityId,
                            idType: pv.idType,
                            idValue: pv.idValue,
                            sourceUrl: bestBody.url,
                        })
                        .onConflictDoNothing();
                    persisted.push(pv);

                    // Cross-Engagement-Lookup — Gibt es denselben Pivot in anderen Engagements?
                    // Bei Build-Hashes ist das das stärkste Owner-Konfidenz-Signal.
                    const others = await database
                        .select({ engagementId: htmlPivots.engagementId })
                        .from(htmlPivots)
                        .where(and(
                            eq(htmlPivots.idType, pv.idType),
                            eq(htmlPivots.idValue, pv.idValue),
                            ne(htmlPivots.engagementId, ctx.engagementId),
                        ));
                    if (others.length > 0) {
                        const otherIds = [...new Set(others.map((r) => r.engagementId))];
                        crossEngagementHits.push({ pivot: pv, otherEngagementIds: otherIds });
                    }
                } catch (err) {
                    console.warn("[domain_html_pivots_extract] persist failed", {
                        target, pv, err: (err as Error).message,
                    });
                }
            }
        }

        // Cross-Engagement-Findings — info-level, Operator triggert Folge-Recherche manuell.
        for (const hit of crossEngagementHits) {
            findings.push({
                fingerprintInputs: ["html_pivot_cross_engagement", target, hit.pivot.idType, hit.pivot.idValue],
                severity: "info",
                category: "exposure",
                title: `Cross-Engagement Pivot: ${hit.pivot.idType}=${hit.pivot.idValue}`,
                description: `Der ${hit.pivot.idType}-Pivot \`${hit.pivot.idValue}\` aus ${bestBody.url} taucht auch in Engagements ${hit.otherEngagementIds.join(", ")} auf. Build-Hash-Matches sind quasi sichere Same-Codebase-Indikatoren; Tracking-ID-Matches können kopiert sein, sind aber starkes Owner-Indiz.`,
                recommendation: "Operator-Review: Sind die anderen Engagements derselbe Customer/Owner-Block? Falls ja → engagement.metadata.customerBlockId verlinken (siehe features.md §2.3).",
                evidence: { pivot: hit.pivot, sourceUrl: bestBody.url, otherEngagementIds: hit.otherEngagementIds },
            });
        }

        // Anti-Noise: HTML-Asset-Hosts (z.B. www.googletagmanager.com) sind Provider, kein Pivot.
        // Hier ist es ein No-Op (wir matchen Asset-Hashes via Pfad, nicht via Host),
        // aber der Provider-Filter hilft als Smoke-Test.
        const sourceHostname = new URL(bestBody.url).hostname;
        if (ctx.engagementId != null) {
            await infrastructureProviderService.classifyAndPersistIfInfra(
                { kind: "html_asset_host", value: sourceHostname },
                { engagementId: ctx.engagementId, source: `domain_html_pivots_extract:source_host` },
            );
        }

        return {
            success: true,
            findings,
            rawOutput: {
                target,
                sourceUrl: bestBody.url,
                attempted,
                pivotsFound: pivots,
                pivotsPersisted: persisted.length,
                crossEngagementHits,
                bodySize: bestBody.html.length,
            },
            durationMs: Date.now() - start,
        };
    },
};

function extractAll(html: string): ExtractedPivot[] {
    const seen = new Set<string>();
    const out: ExtractedPivot[] = [];
    for (const m of PIVOT_MATCHERS) {
        for (const match of html.matchAll(m.matcher)) {
            const value = match[m.valueGroup];
            if (!value) continue;
            const key = `${m.idType}::${value}`;
            if (seen.has(key)) {
                if (m.multi === "first") continue;
                continue;
            }
            seen.add(key);
            out.push({ idType: m.idType, idValue: value });
        }
    }
    return out;
}

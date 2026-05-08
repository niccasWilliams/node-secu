// tech_fingerprint — Phase 5 Hebel-Worker (FULL_SCAN.md §Phase 5).
//
// Scope: passive_only. Ein einziger GET-Request gegen die Root-URL, parst
// HTML-Body + Headers + Cookies + script-src URLs + meta-generator → schickt
// das durch den Pattern-Matcher und persistiert:
//
//   - `entity.data.tech` (Array, gepflegt via techFingerprintService)
//   - `entity.data.techStructured` (slot-orientierte Sicht: frontend/backend/
//     cms/edge/web_server/language + other[]) — direkter Input für Phase-6
//     Auto-Routing-Conditions.
//
// Findings werden NUR für tech-bezogene Risiken erzeugt (Sourcemap-Disclosure,
// Sentry-DSN-Leak, Generator-Meta-Version-Disclosure). Reine Tech-Detection
// ist Kontext, kein Finding.
//
// Body-Cap: 512 KB — verhindert Memory-Exhaustion bei pathologisch großen
// Single-Page-Apps und Foto-Galleries.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";
import {
    buildStructuredSlots,
    matchTechPatterns,
    toTechDrafts,
    type ResponseSnapshot,
} from "../../tech/pattern-matcher";

const BODY_CAP_BYTES = 512 * 1024;

export const techFingerprintWorker: SecurityWorker = {
    jobKey: "tech_fingerprint",
    requiredScope: "passive_only",
    description:
        "Wappalyzer-equivalent Tech-Detection: matched Pattern-DB gegen HTTP-Body + Headers + Cookies + script-src + meta-generator. " +
        "Persistiert sowohl flat tech-array als auch slot-orientiertes techStructured (frontend/backend/cms/edge/...).",
    defaultTimeoutMs: 20_000,

    isApplicable(target) {
        return (
            target.kind === "asset_domain" ||
            target.kind === "asset_subdomain" ||
            target.kind === "asset_url" ||
            target.kind === "domain" ||
            target.kind === "subdomain" ||
            target.kind === "url"
        );
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const url = toHttpsUrl(ctx.target.value);

        let snapshot: ResponseSnapshot | null = null;
        let fetchedUrl = url;
        try {
            const fetched = await fetchSnapshot(url, ctx.timeoutMs, ctx.abortSignal);
            snapshot = fetched.snapshot;
            fetchedUrl = fetched.finalUrl;
        } catch (err) {
            // HTTPS fail → einmaliger HTTP-Fallback (manche kleinere Sites haben
            // kein TLS). Nicht silently übergehen — passive_only-Strategie.
            if (url.startsWith("https://")) {
                const httpUrl = "http://" + url.slice("https://".length);
                try {
                    const fetched = await fetchSnapshot(httpUrl, ctx.timeoutMs, ctx.abortSignal);
                    snapshot = fetched.snapshot;
                    fetchedUrl = fetched.finalUrl;
                } catch (err2) {
                    return {
                        success: false,
                        findings: [],
                        error: `fetch_failed: ${(err as Error).message}; http_fallback: ${(err2 as Error).message}`,
                        durationMs: Date.now() - start,
                    };
                }
            } else {
                return {
                    success: false,
                    findings: [],
                    error: `fetch_failed: ${(err as Error).message}`,
                    durationMs: Date.now() - start,
                };
            }
        }
        if (!snapshot) {
            return {
                success: false,
                findings: [],
                error: "fetch returned no snapshot",
                durationMs: Date.now() - start,
            };
        }

        // 1) Pattern-Matcher
        const matched = matchTechPatterns(snapshot);
        const techDrafts = toTechDrafts(matched);
        const structured = buildStructuredSlots(matched);

        // 2) Disclosure-Findings (das einzige was hier zu Findings führt)
        const findings = collectDisclosureFindings(snapshot, fetchedUrl);

        return {
            success: true,
            rawOutput: {
                fetchedUrl,
                bodyBytes: snapshot.html.length,
                cookieNames: snapshot.cookieNames,
                metaGenerator: snapshot.metaGenerator,
                scriptSrcCount: snapshot.scriptSrcs.length,
                techMatched: matched.map((m) => ({
                    name: m.name,
                    confidence: m.confidence,
                    matchedVia: m.matchedVia,
                    fromImplies: m.fromImplies ?? false,
                })),
                structured,
            },
            findings,
            techFingerprints: techDrafts,
            entityDataPatch: {
                techStructured: structured,
            },
            durationMs: Date.now() - start,
        };
    },
};

// ─── Fetch + Body-Parse ─────────────────────────────────────────────────────

interface FetchedSnapshot {
    snapshot: ResponseSnapshot;
    finalUrl: string;
}

async function fetchSnapshot(
    url: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<FetchedSnapshot> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onParentAbort = () => controller.abort();
    abortSignal?.addEventListener("abort", onParentAbort, { once: true });

    try {
        const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "User-Agent": "node-secu/0.1 (+passive-tech-fingerprint)",
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            },
        });

        // Bound body read — direct stream read mit Byte-Limit.
        const html = await readBodyCapped(res, BODY_CAP_BYTES);

        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => {
            headers[k.toLowerCase()] = v;
        });

        const cookieNames = parseCookieNames(res.headers);
        const scriptSrcs = parseScriptSrcs(html);
        const metaGenerator = parseMetaGenerator(html);

        return {
            snapshot: {
                url,
                html,
                headers,
                cookieNames,
                scriptSrcs,
                metaGenerator,
            },
            finalUrl: res.url || url,
        };
    } finally {
        clearTimeout(timer);
        abortSignal?.removeEventListener("abort", onParentAbort);
    }
}

async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
    if (!res.body) return "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let total = 0;
    let buf = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = value;
            const remaining = maxBytes - total;
            if (remaining <= 0) break;
            const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
            buf += decoder.decode(slice, { stream: true });
            total += slice.length;
            if (total >= maxBytes) break;
        }
    } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
    }
    buf += decoder.decode();
    return buf;
}

function parseCookieNames(h: Headers): string[] {
    // Node fetch (undici) liefert getSetCookie() für mehrere Cookies; Fallback
    // auf single set-cookie header für Edge-Cases.
    const out = new Set<string>();
    const list = (h as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    if (list.length > 0) {
        for (const c of list) {
            const name = c.split("=")[0]?.trim();
            if (name) out.add(name);
        }
    } else {
        const single = h.get("set-cookie");
        if (single) {
            // Best-effort split — set-cookie ist nicht trivial mit Komma getrennt
            // wegen Expires-Header-Werten. Wir bevorzugen die getSetCookie-API.
            for (const part of single.split(/,\s*(?=[A-Za-z0-9_\-]+=)/)) {
                const name = part.split("=")[0]?.trim();
                if (name) out.add(name);
            }
        }
    }
    return [...out];
}

function parseScriptSrcs(html: string): string[] {
    const out: string[] = [];
    // Tolerant gegenüber Attribut-Reihenfolge + Quotes (single/double/none).
    const re = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) != null) {
        const src = m[1] ?? m[2] ?? m[3];
        if (src) out.push(src.trim());
        if (out.length >= 200) break; // hard cap
    }
    return out;
}

function parseMetaGenerator(html: string): string | null {
    const m = html.match(/<meta\b[^>]*\bname\s*=\s*["']?generator["']?[^>]*\bcontent\s*=\s*"([^"]+)"/i)
        ?? html.match(/<meta\b[^>]*\bname\s*=\s*["']?generator["']?[^>]*\bcontent\s*=\s*'([^']+)'/i);
    return m?.[1]?.trim() ?? null;
}

// ─── Disclosure-Findings ────────────────────────────────────────────────────

const SENTRY_DSN_RE = /https?:\/\/[a-f0-9]+@[a-z0-9.-]+(?:\.ingest)?\.sentry\.io\/\d+/i;
const SOURCEMAP_RE = /\/\/#\s*sourceMappingURL=([^\s"'<>]+\.map)/i;
const NEXT_BUILD_MANIFEST_RE = /\/_next\/static\/[^\s"'<>]+\/_buildManifest\.js/;

function collectDisclosureFindings(snap: ResponseSnapshot, finalUrl: string): FindingDraft[] {
    const findings: FindingDraft[] = [];

    // Sourcemap-URL im HTML: production-Bundle leakt Source.
    const sourceMap = snap.html.match(SOURCEMAP_RE);
    if (sourceMap) {
        findings.push({
            fingerprintInputs: ["tech", "sourcemap_disclosed", finalUrl],
            severity: "low",
            category: "exposure",
            title: "Sourcemap-URL im HTML referenziert",
            description:
                `Im Body wird via "//# sourceMappingURL=" auf eine .map-Datei verwiesen ` +
                `(${sourceMap[1]}). Wenn diese Datei öffentlich auflösbar ist, kann ein Angreifer ` +
                `den minified JS-Bundle vollständig de-obfuscaten und Logik / API-Endpoints / ` +
                `Secret-Patterns rekonstruieren.`,
            recommendation:
                "Build-Pipeline so konfigurieren, dass Sourcemaps in Production nicht ausgeliefert werden " +
                "(z.B. Next.js: productionBrowserSourceMaps=false; Vite: build.sourcemap='hidden').",
            evidence: { sourceMapUrl: sourceMap[1] },
        });
    }

    // Sentry-DSN im Body — DSN ist by-design halb-öffentlich, aber das ist
    // genau wo die Verwirrung herkommt: ein DSN erlaubt anonymes Senden von
    // Events, was bei ungeschütztem Projekt zu Spam/DoS führt.
    const dsn = snap.html.match(SENTRY_DSN_RE);
    if (dsn) {
        findings.push({
            fingerprintInputs: ["tech", "sentry_dsn_exposed", finalUrl],
            severity: "info",
            category: "exposure",
            title: "Sentry-DSN im HTML/JS-Bundle gefunden",
            description:
                `Es wurde eine Sentry-DSN-URL im Response-Body entdeckt (${truncate(dsn[0], 80)}). ` +
                `Eine DSN ist zwar designt fürs Frontend, aber bedeutet: jeder kann anonym Events ins ` +
                `Sentry-Projekt schicken. Bei ungesicherten Projekten kann das zu Quote-Burn / ` +
                `Alert-Spam führen.`,
            recommendation:
                "Im Sentry-Projekt 'Inbound Filters' aktivieren (z.B. only origin = production-host) " +
                "und Allow-list für allowed_url Patterns konfigurieren.",
            evidence: { dsn: dsn[0] },
        });
    }

    // Next.js Build-Manifest-URL referenziert → kein direktes Risiko, aber Hinweis
    // auf interne Build-Hash und kann bei Source-Map-Ablage Forensik-Material sein.
    const buildManifest = snap.html.match(NEXT_BUILD_MANIFEST_RE);
    if (buildManifest) {
        findings.push({
            fingerprintInputs: ["tech", "nextjs_build_manifest", finalUrl],
            severity: "info",
            category: "config",
            title: "Next.js Build-Manifest-URL exposed",
            description:
                `Im HTML referenziert die Seite ein Next.js Build-Manifest (${buildManifest[0]}). ` +
                `Das ist Default-Verhalten und kein direktes Risiko, hilft aber Angreifern bei der ` +
                `Identifikation der Next.js-Version und der gerouteten Pages.`,
            recommendation:
                "Kein Code-Fix nötig — als Kontext für stack-spezifische Folge-Probes in Phase 6 " +
                "(next_recon Worker).",
            evidence: { manifest: buildManifest[0] },
        });
    }

    // Generator-Meta-Disclosure mit Version: bei CMS-Stacks ein klassisches
    // Recon-Signal. Wir flaggen das nur als info, downgrade ggf. wenn Customer
    // bewusst öffentlich ist.
    if (snap.metaGenerator && /\d/.test(snap.metaGenerator)) {
        findings.push({
            fingerprintInputs: ["tech", "generator_meta_version", finalUrl],
            severity: "info",
            category: "config",
            title: `Generator-Meta-Tag verrät Stack-Version: "${truncate(snap.metaGenerator, 60)}"`,
            description:
                `Der HTML-<meta name="generator">-Tag enthält eine Versionsangabe — typisch bei ` +
                `WordPress, Drupal, Joomla, Hugo, Astro. Angreifer nutzen das, um direkt nach ` +
                `versions-spezifischen CVEs zu suchen.`,
            recommendation:
                "Generator-Tag in der CMS-Konfiguration entfernen. WordPress: " +
                "`remove_action('wp_head', 'wp_generator');` im Theme. Hugo: `disableHugoGeneratorInject = true`.",
            evidence: { generator: snap.metaGenerator },
        });
    }

    return findings;
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n) + "…";
}

function toHttpsUrl(value: string): string {
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return `https://${value}`;
}

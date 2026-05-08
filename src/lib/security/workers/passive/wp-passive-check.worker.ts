// WP-Passive-Check-Worker — leichtgewichtiger Versions-Check für WordPress-Sites.
//
// Vorgehen: jeweils EIN HTTP-GET pro Pfad — kein Crawling, kein Brute-Force.
// Gilt als "passive_only", weil ein einzelner Public-Resource-GET nichts ist,
// was im Browser nicht ohnehin passieren würde. Wird vom Playbook-Runner nur
// gestartet, wenn der Tech-Fingerprint des Targets "wordpress" enthält.
//
// Erkennt:
//   - Versionsleck via /readme.html (Standard-WordPress-Datei)
//   - Versionsleck via Meta-Generator-Tag in der Homepage
//   - Offene wp-json-API (rein informativ, oft sinnvoll erlaubt)

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
    TechDraft,
} from "../worker.types";

export const wpPassiveCheckWorker: SecurityWorker = {
    jobKey: "wp_passive_check",
    requiredScope: "passive_only",
    description: "Passive WordPress-Indikatoren: readme.html, Meta-Generator, wp-json — je ein einzelner GET.",
    defaultTimeoutMs: 20_000,

    isApplicable(target) {
        return ["asset_domain", "asset_subdomain", "asset_url", "domain", "subdomain", "url"].includes(target.kind);
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const findings: FindingDraft[] = [];
        const tech: TechDraft[] = [];
        const base = toHttpsBase(ctx.target.value);

        const readme = await fetchOnce(`${base}/readme.html`, ctx);
        if (readme.ok && readme.body && /wordpress/i.test(readme.body)) {
            const m = readme.body.match(/Version\s+([\d.]+)/i);
            if (m) {
                findings.push({
                    fingerprintInputs: ["cms", "wp_version_exposed_readme", base],
                    severity: "medium",
                    category: "cms",
                    title: `WordPress-Version ${m[1]} via readme.html lesbar`,
                    description: `${base}/readme.html liefert die exakte WP-Version (${m[1]}). Erleichtert Angreifern das Mapping auf bekannte CVEs.`,
                    recommendation: "Datei readme.html aus dem Webroot löschen oder per Webserver-Rule blockieren.",
                    evidence: { url: `${base}/readme.html`, version: m[1] },
                });
                tech.push({
                    techName: "wordpress",
                    version: m[1],
                    detectionSource: "html",
                    confidence: "high",
                    evidence: { source: "readme.html" },
                });
            }
        }

        const home = await fetchOnce(base, ctx);
        if (home.ok && home.body) {
            const meta = home.body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
            if (meta && /wordpress/i.test(meta[1])) {
                const versionMatch = meta[1].match(/([\d.]+)/);
                findings.push({
                    fingerprintInputs: ["cms", "wp_version_exposed_meta", base],
                    severity: "low",
                    category: "cms",
                    title: `WordPress-Version via Meta-Generator-Tag erkennbar`,
                    description: `Die Homepage enthält ein <meta name="generator" content="${meta[1]}">. Auch ohne readme.html offenbart das den Tech-Stack inkl. Version.`,
                    recommendation: "Meta-Generator entfernen (z.B. via 'remove_action' Hook oder Security-Plugin).",
                    evidence: { generator: meta[1] },
                });
                if (versionMatch) {
                    tech.push({
                        techName: "wordpress",
                        version: versionMatch[1],
                        detectionSource: "html",
                        confidence: "high",
                        evidence: { source: "meta_generator", raw: meta[1] },
                    });
                }
            }
        }

        const wpJson = await fetchOnce(`${base}/wp-json/`, ctx);
        if (wpJson.ok && wpJson.body && /^[\s\n]*\{/.test(wpJson.body)) {
            findings.push({
                fingerprintInputs: ["cms", "wp_json_open", base],
                severity: "info",
                category: "config",
                title: "wp-json REST-API erreichbar",
                description: `${base}/wp-json/ liefert eine valide JSON-Antwort. Standard-WP-Verhalten, aber Angreifer können darüber u.a. die Liste aller User-Slugs abfragen (/wp-json/wp/v2/users).`,
                recommendation: "User-Endpoint mit einem Plugin (Disable REST API / Stop User Enumeration) absichern oder per WAF blockieren.",
            });
        }

        return {
            success: true,
            findings,
            techFingerprints: tech,
            durationMs: Date.now() - start,
        };
    },
};

function toHttpsBase(value: string): string {
    if (value.startsWith("http://") || value.startsWith("https://")) {
        try {
            const u = new URL(value);
            return `${u.protocol}//${u.host}`;
        } catch { /* fallthrough */ }
    }
    return `https://${value}`;
}

async function fetchOnce(
    url: string,
    ctx: WorkerContext,
): Promise<{ ok: boolean; status?: number; body?: string }> {
    try {
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        ctx.abortSignal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(), Math.min(ctx.timeoutMs, 8_000));
        try {
            const res = await fetch(url, {
                method: "GET",
                signal: controller.signal,
                redirect: "follow",
                headers: { "User-Agent": "node-secu/0.2 (+passive-scan)" },
            });
            // Body deliberately length-limited to keep memory + parsing tight.
            const reader = res.body?.getReader();
            let body = "";
            if (reader) {
                const dec = new TextDecoder();
                let total = 0;
                while (total < 64_000) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    total += value.byteLength;
                    body += dec.decode(value, { stream: true });
                }
                try { await reader.cancel(); } catch { /* ignore */ }
            }
            return { ok: res.ok, status: res.status, body };
        } finally {
            clearTimeout(timer);
            ctx.abortSignal?.removeEventListener("abort", onAbort);
        }
    } catch {
        return { ok: false };
    }
}

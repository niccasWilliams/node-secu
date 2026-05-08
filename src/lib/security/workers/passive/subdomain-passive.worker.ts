// Subdomain-Passive-Worker — passive Subdomain-Enumeration aus mehreren Quellen.
//
// Sprint 2 #13 (OSINT-Engine, features.md R2/R3/R10/L4/L9) — Multi-Source-
// Aggregator mit Live-Verify-Pflicht. Quellen, je in eigenem Sub-Timeout:
//
//   1. **subfinder** (CLI) — wenn Binary verfügbar; viele OSINT-APIs.
//   2. **crt.sh** (HTTP) — CT-Logs, sehr breit aber oft 502-Phasen (R2 Multi-
//      Source-Fallback).
//   3. **HackerTarget hostsearch** (HTTP) — kostenloses 50/day free-tier
//      DNS-Index (https://api.hackertarget.com/hostsearch/?q=<domain>).
//   4. **Wayback Machine CDX** (HTTP) — historische Subdomains aus den
//      Archive-URLs (http://web.archive.org/cdx/...).
//   5. **DNS-Bruteforce** — kleines Common-Subdomain-Wordlist gegen den
//      Resolver. Konservativ (~50 Top-Namen) damit kein Rate-Limit-Problem.
//
// Live-Verify-Gate (R3, L4): Jede gemeldete Subdomain wird via `dns-verify.ts`
// resolved. Auflösbare Hits werden als `asset_subdomain` mit
// `data.staleSince=null` discovered. Nicht-resolvende Hits werden TROTZDEM
// persistiert (sie haben Wert für Cross-Engagement-Pivots), aber als
// `speculative=true` mit `data.staleSince=<ts>` markiert (statt gedroppt).
//
// Source-Provenance: jede Discovery trägt `data.sources` mit der Liste der
// Quellen, die den Hit gemeldet haben — gleicher Hit aus 3 Quellen ist
// confidence-stärker als ein Hit aus 1 Quelle.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { spawnTool, parseJsonl } from "../_lib/spawn-tool";
import { dnsVerify } from "../../osint/dns-verify";
import { httpFetch } from "../../osint/http-fetch";

const CRT_SH_URL = "https://crt.sh/?q=%25.{domain}&output=json";
const HACKERTARGET_URL = "https://api.hackertarget.com/hostsearch/?q={domain}";
const WAYBACK_CDX_URL = "https://web.archive.org/cdx/search/cdx?url=*.{domain}/*&output=json&fl=original&collapse=urlkey&limit=2000";

interface CrtShRow {
    name_value?: string;
    common_name?: string;
}

interface SubfinderRow {
    host?: string;
    source?: string;
    input?: string;
}

/**
 * Konservatives Common-Subdomain-Wordlist für DNS-Bruteforce. ~50 Namen,
 * deckt typische Web-/Mail-/Admin-/Dev-Subdomains ab. Bewusst klein, damit
 * der Worker auch bei hoher Engagement-Anzahl im 1h-OSINT-Budget bleibt.
 */
const DNS_BF_WORDLIST: ReadonlyArray<string> = [
    "www", "mail", "email", "smtp", "imap", "pop", "pop3", "ftp", "sftp",
    "webmail", "owa", "remote", "vpn", "portal", "admin", "administrator",
    "api", "api-v1", "api-v2", "rest", "graphql", "ws",
    "app", "apps", "my", "secure", "auth", "sso", "login", "id", "accounts",
    "dev", "test", "staging", "qa", "beta", "preview", "demo", "lab",
    "blog", "news", "wiki", "docs", "support", "help", "kb",
    "shop", "store", "cart", "checkout", "pay", "billing",
    "media", "static", "assets", "cdn", "files", "downloads",
    "git", "gitlab", "jenkins", "ci", "build",
    "monitor", "monitoring", "status", "metrics", "grafana",
];

const HACKERTARGET_TIMEOUT_MS = 12_000;
const WAYBACK_TIMEOUT_MS = 15_000;
const VERIFY_CONCURRENCY = 12;

interface SourceHit {
    host: string;
    sources: Set<string>;
}

export const subdomainPassiveWorker: SecurityWorker = {
    jobKey: "subdomain_passive",
    requiredScope: "passive_only",
    description: "Multi-Source-Subdomain-Enumeration (subfinder, crt.sh, HackerTarget, Wayback, DNS-BF) mit Live-Verify-Gate.",
    defaultTimeoutMs: 120_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "domain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const root = normalizeDomain(ctx.target.value);
        const findings: FindingDraft[] = [];

        const aggregate = new Map<string, SourceHit>();
        const sourceErrors: Record<string, string> = {};
        const sourceStats: Record<string, number> = {};

        const recordHit = (host: string, source: string): void => {
            const cleaned = cleanSubdomainCandidate(host, root);
            if (!cleaned || cleaned === root) return;
            let entry = aggregate.get(cleaned);
            if (!entry) {
                entry = { host: cleaned, sources: new Set() };
                aggregate.set(cleaned, entry);
            }
            entry.sources.add(source);
        };

        // Source-Allokationsbudget — pro Quelle ein eigenes Sub-Timeout, damit
        // ein hängender Provider nicht das ganze Worker-Budget killt.
        const subfinderBudget = Math.max(Math.floor(ctx.timeoutMs * 0.4), 30_000);
        const httpBudget = Math.max(Math.floor((ctx.timeoutMs - subfinderBudget) / 4), 8_000);

        // Source 1: subfinder (Primary wenn verfügbar).
        if (subfinderBudget > 5_000) {
            const sub = await runSubfinder(root, subfinderBudget, ctx.abortSignal);
            sourceStats["subfinder"] = sub.subdomains.size;
            if (sub.error) sourceErrors["subfinder"] = sub.error;
            for (const s of sub.subdomains) recordHit(s, "subfinder");
        }

        // Source 2: crt.sh
        const crt = await runCrtSh(root, httpBudget, ctx.abortSignal);
        sourceStats["crt.sh"] = crt.subdomains.size;
        if (crt.error) sourceErrors["crt.sh"] = crt.error;
        for (const s of crt.subdomains) recordHit(s, "crt.sh");

        // Source 3: HackerTarget hostsearch
        const ht = await runHackerTarget(root, httpBudget, ctx.abortSignal);
        sourceStats["hackertarget"] = ht.subdomains.size;
        if (ht.error) sourceErrors["hackertarget"] = ht.error;
        for (const s of ht.subdomains) recordHit(s, "hackertarget");

        // Source 4: Wayback Machine CDX
        const wb = await runWayback(root, httpBudget, ctx.abortSignal);
        sourceStats["wayback"] = wb.subdomains.size;
        if (wb.error) sourceErrors["wayback"] = wb.error;
        for (const s of wb.subdomains) recordHit(s, "wayback");

        // Source 5: DNS-Bruteforce — direkter Resolver-Hit aufs Wordlist.
        const dnsBf = await runDnsBruteforce(root, ctx.abortSignal);
        sourceStats["dns_bruteforce"] = dnsBf.subdomains.size;
        for (const s of dnsBf.subdomains) recordHit(s, "dns_bruteforce");

        // Wenn ALLE Quellen leer und alle Errors → fail.
        const allFailed =
            aggregate.size === 0 &&
            Object.keys(sourceErrors).length >= 4;
        if (allFailed) {
            return {
                success: false,
                findings,
                discoveredEntities: [],
                error: `all sources failed: ${Object.entries(sourceErrors).map(([k, v]) => `${k}=${v}`).join("; ")}`,
                durationMs: Date.now() - start,
                rawOutput: { sourceStats, sourceErrors },
            };
        }

        // Live-Verify mit Concurrency-Limit. Stale-Hits NICHT droppen,
        // sondern als speculative=true markieren (R3 / L4).
        const allHosts = [...aggregate.keys()];
        const verifyResults = new Map<string, { resolves: boolean; ipv4: string[]; checkedAt: string }>();
        for (let i = 0; i < allHosts.length; i += VERIFY_CONCURRENCY) {
            if (ctx.abortSignal?.aborted) break;
            const slice = allHosts.slice(i, i + VERIFY_CONCURRENCY);
            const results = await Promise.all(slice.map((h) =>
                dnsVerify.lookup(h, { types: ["a", "aaaa"], cacheTtlMs: 60_000, timeoutMs: 5_000, abortSignal: ctx.abortSignal })
                    .then((r) => ({ host: h, resolves: r.resolves, ipv4: r.a, checkedAt: r.checkedAt }))
                    .catch(() => ({ host: h, resolves: false, ipv4: [] as string[], checkedAt: new Date().toISOString() })),
            ));
            for (const r of results) verifyResults.set(r.host, r);
        }

        const discovered: DiscoveredEntityDraft[] = [];
        let resolvedCount = 0;
        let staleCount = 0;
        for (const [host, entry] of aggregate.entries()) {
            const verify = verifyResults.get(host);
            const resolves = verify?.resolves ?? false;
            const sources = [...entry.sources];
            if (resolves) resolvedCount += 1; else staleCount += 1;
            // Confidence-Heuristik: Multi-Source-Boost (mehr Quellen = höher),
            // resolves=true ist Pflicht für factual; sonst speculative=true.
            const baseConfidence = resolves ? 90 : 35;
            const sourceBoost = Math.min(8, sources.length * 2);
            discovered.push({
                kind: "asset_subdomain",
                primaryValue: host,
                displayName: host,
                data: {
                    parentDomain: root,
                    sources,
                    resolves,
                    ipv4: verify?.ipv4 ?? [],
                    lastVerifiedAt: verify?.checkedAt ?? null,
                    staleSince: resolves ? null : (verify?.checkedAt ?? new Date().toISOString()),
                },
                relationshipToRoot: {
                    kind: "subdomain_of",
                    direction: "from_discovered_to_root",
                    confidence: baseConfidence + sourceBoost,
                },
                source: `recon_${sources[0]}`,
                speculativeOverride: resolves ? false : true,
                evidence: sources.map((s) => ({
                    source: `subdomain_passive:${s}`,
                    snippet: `Subdomain ${host} aus ${s}${resolves ? ` (resolves: ${verify?.ipv4.slice(0, 2).join(",")})` : " (stale, no DNS resolution)"}`,
                    confidenceContribution: resolves ? 0.5 : 0.25,
                    evidenceClass: "organic",
                })),
            });
        }

        // Findings: bei "viel Exposure" einen Info-Eintrag.
        if (resolvedCount >= 25) {
            findings.push({
                fingerprintInputs: ["recon", "subdomain_volume", root],
                severity: "info",
                category: "exposure",
                title: `Hohe Subdomain-Anzahl (live): ${resolvedCount}`,
                description: `Für ${root} wurden ${resolvedCount} live-resolving Subdomains gefunden (+${staleCount} historisch/stale). Hohe Surface-Area — jeder Eintrag ist ein potenzielles Recon-Ziel.`,
                recommendation: "Inventarisieren: welche dieser Hosts sind aktiv? Stale Subdomains (z.B. CDN-CNAMEs auf gelöschte Buckets) sind klassische Subdomain-Takeover-Vektoren — die hier markierten staleSince=…-Hits dazu prüfen.",
                evidence: { sample: [...aggregate.keys()].slice(0, 10), resolvedCount, staleCount, sourceStats },
            });
        }

        // Wenn subfinder fehlt (nicht installiert), info-Hinweis loggen.
        if (sourceErrors["subfinder"]?.startsWith("binary not found")) {
            findings.push({
                fingerprintInputs: ["config", "subfinder_missing"],
                severity: "info",
                category: "config",
                title: "subfinder-Binary nicht verfügbar",
                description: "Der Subdomain-Worker läuft ohne subfinder. Multi-Source-Aggregation greift trotzdem (crt.sh, HackerTarget, Wayback, DNS-BF), aber subfinder bringt 10+ weitere Quellen.",
                recommendation: "subfinder lokal installieren (`go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest`) und/oder via SUBFINDER_BINARY env auf den Pfad zeigen lassen.",
                evidence: { error: sourceErrors["subfinder"] },
            });
        }

        return {
            success: true,
            rawOutput: {
                rootDomain: root,
                sourceStats,
                sourceErrors,
                totalUnique: aggregate.size,
                resolvedCount,
                staleCount,
            },
            findings,
            discoveredEntities: discovered,
            durationMs: Date.now() - start,
        };
    },
};

async function runSubfinder(
    root: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<{ subdomains: Set<string>; error?: string }> {
    const subdomains = new Set<string>();
    const binary = process.env.SUBFINDER_BINARY ?? "subfinder";
    const useAll = process.env.SUBFINDER_ALL_SOURCES === "1";
    const subfinderInternalTimeout = String(Math.floor(timeoutMs / 1000));
    const args = ["-d", root, "-silent", "-oJ", "-timeout", subfinderInternalTimeout, "-t", "20"];
    if (useAll) args.push("-all");

    const result = await spawnTool({
        binary,
        args,
        timeoutMs,
        abortSignal,
        fallbackPaths: ["~/go/bin/subfinder", "/usr/local/bin/subfinder"],
        allowedExitCodes: [0, 1],
    });

    if (!result.resolvedBinary) {
        return { subdomains, error: result.error ?? "binary not found" };
    }
    const rows = parseJsonl<SubfinderRow>(result.stdout);
    for (const r of rows) {
        if (r.host) subdomains.add(r.host.toLowerCase());
    }
    if (!result.success && subdomains.size === 0) {
        return { subdomains, error: result.error ?? "subfinder failed without output" };
    }
    return { subdomains };
}

async function runCrtSh(
    root: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<{ subdomains: Set<string>; error?: string }> {
    const subdomains = new Set<string>();
    if (timeoutMs < 1_000) return { subdomains, error: "no-time-budget" };
    const url = CRT_SH_URL.replace("{domain}", encodeURIComponent(root));
    const res = await httpFetch<unknown>(url, {
        timeoutMs,
        signal: abortSignal,
        providerKey: "crt.sh",
        responseType: "json",
        headers: { "Accept": "application/json" },
    });
    if (!res.success || !Array.isArray(res.data)) {
        // crt.sh liefert manchmal NDJSON statt JSON-Array. Wenn .text vorhanden, parsen.
        if (typeof res.text === "string" && res.text.trim()) {
            for (const line of res.text.split("\n")) {
                const t = line.trim();
                if (!t) continue;
                try {
                    const row = JSON.parse(t) as CrtShRow;
                    pushCrt(row, subdomains);
                } catch { /* skip */ }
            }
            if (subdomains.size > 0) return { subdomains };
        }
        return { subdomains, error: res.error ?? `http_${res.status}` };
    }
    for (const row of res.data as CrtShRow[]) pushCrt(row, subdomains);
    return { subdomains };
}

function pushCrt(row: CrtShRow, into: Set<string>): void {
    const candidates = [row.name_value, row.common_name].filter(Boolean) as string[];
    for (const raw of candidates) {
        for (const piece of raw.split(/\s+/)) {
            if (piece) into.add(piece.toLowerCase());
        }
    }
}

async function runHackerTarget(
    root: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<{ subdomains: Set<string>; error?: string }> {
    const subdomains = new Set<string>();
    const url = HACKERTARGET_URL.replace("{domain}", encodeURIComponent(root));
    const res = await httpFetch<string>(url, {
        timeoutMs: Math.min(HACKERTARGET_TIMEOUT_MS, timeoutMs),
        signal: abortSignal,
        providerKey: "hackertarget",
        responseType: "text",
    });
    if (!res.success || !res.text) {
        return { subdomains, error: res.error ?? `http_${res.status}` };
    }
    // Free-Tier-Limit: liefert "API count exceeded - Increase Quota with Membership"
    if (/api\s+count\s+exceeded/i.test(res.text)) {
        return { subdomains, error: "api_count_exceeded" };
    }
    // Format: "host,ip\nhost,ip\n..."
    for (const line of res.text.split("\n")) {
        const host = line.split(",")[0]?.trim().toLowerCase();
        if (host) subdomains.add(host);
    }
    return { subdomains };
}

async function runWayback(
    root: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
): Promise<{ subdomains: Set<string>; error?: string }> {
    const subdomains = new Set<string>();
    const url = WAYBACK_CDX_URL.replace("{domain}", encodeURIComponent(root));
    const res = await httpFetch<unknown>(url, {
        timeoutMs: Math.min(WAYBACK_TIMEOUT_MS, timeoutMs),
        signal: abortSignal,
        providerKey: "wayback",
        responseType: "json",
        headers: { "Accept": "application/json" },
    });
    if (!res.success || !Array.isArray(res.data)) {
        return { subdomains, error: res.error ?? `http_${res.status}` };
    }
    // Wayback CDX-JSON: erste Zeile ist Header (["original"]), Rest sind Daten.
    const rows = res.data as string[][];
    for (const row of rows.slice(1)) {
        const original = row[0];
        if (!original) continue;
        try {
            const u = new URL(original);
            subdomains.add(u.hostname.toLowerCase());
        } catch { /* skip malformed URL */ }
    }
    return { subdomains };
}

async function runDnsBruteforce(
    root: string,
    abortSignal?: AbortSignal,
): Promise<{ subdomains: Set<string> }> {
    const subdomains = new Set<string>();
    const candidates = DNS_BF_WORDLIST.map((w) => `${w}.${root}`);
    const concurrency = 8;
    for (let i = 0; i < candidates.length; i += concurrency) {
        if (abortSignal?.aborted) break;
        const slice = candidates.slice(i, i + concurrency);
        const results = await Promise.all(slice.map((h) =>
            dnsVerify.lookup(h, { types: ["a", "aaaa", "cname"], cacheTtlMs: 60_000, timeoutMs: 3_000, abortSignal })
                .then((r) => ({ host: h, resolves: r.resolves }))
                .catch(() => ({ host: h, resolves: false })),
        ));
        for (const r of results) {
            if (r.resolves) subdomains.add(r.host);
        }
    }
    return { subdomains };
}

function normalizeDomain(input: string): string {
    let v = input.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) {
        try { v = new URL(v).hostname; } catch { /* keep raw */ }
    }
    if (v.endsWith(".")) v = v.slice(0, -1);
    return v;
}

function cleanSubdomainCandidate(raw: string, root: string): string | null {
    let v = raw.trim().toLowerCase();
    if (!v) return null;
    if (v.startsWith("*.")) v = v.slice(2);
    if (v.endsWith(".")) v = v.slice(0, -1);
    if (!/^[a-z0-9.-]+$/i.test(v)) return null;
    if (v === root) return root;
    if (!v.endsWith(`.${root}`)) return null;
    return v;
}

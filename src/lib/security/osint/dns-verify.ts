// Sprint 1.5 (OSINT-Engine, features.md R3) — Live-DNS-Verify-Util.
//
// PROBLEM (aus Live-Test 2026-05-08): 3rd-party-Quellen (HackerTarget, crt.sh,
// Wayback) liefern stale Subdomain-/Host-Records aus historischen DNS-Snapshots.
// Direkt-Persistierung füllt den Engagement-Graph mit Karteileichen
// ("Subdomains die seit 2 Jahren nicht mehr resolven"). Lösung: nach jeder
// 3rd-party-Discovery LIVE-resolven; nicht-resolving Hits werden als
// `entity.data.staleSince=<ts>` markiert (NICHT gedroppt — historische Records
// haben ihren Wert für Cross-Engagement-Pivots), aber ohne A-Records.
//
// Cache: per-Process Map mit konfigurierbarem TTL (Default 5 Min). Verhindert,
// dass derselbe Host innerhalb eines Worker-Runs mehrfach geresolvt wird.
//
// Bewusst NICHT abgedeckt:
//   - Resolver-Pinning (immer Node-default — 1.1.1.1 / 8.8.8.8 wenn gewünscht
//     via /etc/resolv.conf konfigurierbar). Operator-Lab-Umgebung soll system-
//     resolver nutzen, sonst läuft das Lokal-Lab divergent zur Prod.
//   - DNS-over-HTTPS (DoH). Falls Stealth-Anforderung steigt: Phase 3.
//   - Volle DNSSEC-Validation. Wir prüfen nur DS/DNSKEY-Existenz als Signal —
//     vollständige Chain-Validation würde dnssec-validator-Lib brauchen.

import dns from "node:dns/promises";

export interface DnsVerifyResult {
    host: string;
    /** Hauptaussage: hat der Host MIND. EINEN A/AAAA/CNAME-Record? */
    resolves: boolean;
    a: string[];
    aaaa: string[];
    cname: string | null;
    mx: Array<{ exchange: string; priority: number }>;
    ns: string[];
    txt: string[];
    /** Heuristik: hat die Zone DS- oder DNSKEY-Records? (kein Chain-Validate). */
    dnssecHint: boolean;
    /** Wann zuletzt geresolvt — kann gleicher Cache-Eintrag sein. */
    checkedAt: string;
    /** True wenn aus Cache (für Diagnose). */
    fromCache: boolean;
    /** Roh-Errors je Record-Type — leer wenn alles ok. */
    errors: Record<string, string>;
}

interface CacheEntry {
    expiresAt: number;
    result: DnsVerifyResult;
}

const CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface DnsVerifyOptions {
    /** TTL in ms; 0 = nicht cachen. Default 5 Min. */
    cacheTtlMs?: number;
    /** Welche Record-Types abfragen. Default: alle. */
    types?: Array<"a" | "aaaa" | "cname" | "mx" | "ns" | "txt" | "dnssec">;
    /** Per-Lookup-Timeout (Node DNS hat keinen builtin Timeout — emulieren via Promise.race). */
    timeoutMs?: number;
    abortSignal?: AbortSignal;
}

const ALL_TYPES: NonNullable<DnsVerifyOptions["types"]> = ["a", "aaaa", "cname", "mx", "ns", "txt", "dnssec"];

export const dnsVerify = {
    /**
     * Prüft alle (oder ausgewählte) DNS-Record-Types für `host`. Cached
     * standardmäßig 5 Min pro Host+Types-Combination.
     */
    async lookup(host: string, options: DnsVerifyOptions = {}): Promise<DnsVerifyResult> {
        const cleaned = normalizeHost(host);
        if (!cleaned) {
            return emptyResult(host, false, { input: "invalid_host" });
        }

        const types = options.types ?? ALL_TYPES;
        const cacheKey = `${cleaned}|${[...types].sort().join(",")}`;
        const ttl = options.cacheTtlMs ?? DEFAULT_TTL_MS;
        const now = Date.now();
        const cached = CACHE.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return { ...cached.result, fromCache: true };
        }

        const errors: Record<string, string> = {};
        const wantsA = types.includes("a");
        const wantsAaaa = types.includes("aaaa");
        const wantsCname = types.includes("cname");
        const wantsMx = types.includes("mx");
        const wantsNs = types.includes("ns");
        const wantsTxt = types.includes("txt");
        const wantsDnssec = types.includes("dnssec");

        const timeoutMs = options.timeoutMs ?? 8_000;
        const safe = makeSafeRunner(timeoutMs, options.abortSignal);

        const [aR, aaaaR, cnameR, mxR, nsR, txtR, dsR, dnskeyR] = await Promise.all([
            wantsA ? safe(() => dns.resolve4(cleaned), "a") : noop("a"),
            wantsAaaa ? safe(() => dns.resolve6(cleaned), "aaaa") : noop("aaaa"),
            wantsCname ? safe(() => dns.resolveCname(cleaned), "cname") : noop("cname"),
            wantsMx ? safe(() => dns.resolveMx(cleaned), "mx") : noop("mx"),
            wantsNs ? safe(() => dns.resolveNs(cleaned), "ns") : noop("ns"),
            wantsTxt ? safe(() => dns.resolveTxt(cleaned), "txt") : noop("txt"),
            wantsDnssec ? safe(() => dns.resolve(cleaned, "DS" as never), "ds") : noop("ds"),
            wantsDnssec ? safe(() => dns.resolve(cleaned, "DNSKEY" as never), "dnskey") : noop("dnskey"),
        ]);

        const a = (aR.value ?? []) as string[];
        const aaaa = (aaaaR.value ?? []) as string[];
        const cname = ((cnameR.value ?? []) as string[])[0] ?? null;
        const mx = ((mxR.value ?? []) as Array<{ exchange: string; priority: number }>) ?? [];
        const ns = (nsR.value ?? []) as string[];
        const txt = ((txtR.value ?? []) as string[][]).map((r) => r.join(""));
        const dsRows = (dsR.value as unknown[] | undefined) ?? [];
        const dnskeyRows = (dnskeyR.value as unknown[] | undefined) ?? [];

        for (const r of [aR, aaaaR, cnameR, mxR, nsR, txtR, dsR, dnskeyR]) {
            if (r.error) errors[r.label] = r.error;
        }

        const result: DnsVerifyResult = {
            host: cleaned,
            resolves: a.length > 0 || aaaa.length > 0 || cname != null,
            a,
            aaaa,
            cname,
            mx,
            ns,
            txt,
            dnssecHint: dsRows.length > 0 || dnskeyRows.length > 0,
            checkedAt: new Date().toISOString(),
            fromCache: false,
            errors,
        };

        if (ttl > 0) CACHE.set(cacheKey, { expiresAt: now + ttl, result });
        return result;
    },

    /** Test-/Diagnose-Helper: Cache leeren. */
    _resetCache(): void {
        CACHE.clear();
    },

    /** Snapshot für Diagnose. */
    cacheSnapshot(): { size: number; sampleKeys: string[] } {
        return {
            size: CACHE.size,
            sampleKeys: [...CACHE.keys()].slice(0, 10),
        };
    },
};

function normalizeHost(input: string): string | null {
    if (!input) return null;
    let v = input.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) {
        try { v = new URL(v).hostname; } catch { return null; }
    }
    if (v.endsWith(".")) v = v.slice(0, -1);
    if (!/^[a-z0-9.-]+$/.test(v)) return null;
    if (v.length === 0 || v.length > 253) return null;
    return v;
}

function emptyResult(host: string, resolves: boolean, errors: Record<string, string>): DnsVerifyResult {
    return {
        host,
        resolves,
        a: [],
        aaaa: [],
        cname: null,
        mx: [],
        ns: [],
        txt: [],
        dnssecHint: false,
        checkedAt: new Date().toISOString(),
        fromCache: false,
        errors,
    };
}

interface SafeRunResult {
    label: string;
    value?: unknown;
    error?: string;
}

function makeSafeRunner(timeoutMs: number, abortSignal?: AbortSignal) {
    return async function safe<T>(fn: () => Promise<T>, label: string): Promise<SafeRunResult> {
        if (abortSignal?.aborted) return { label, error: "aborted" };
        try {
            const value = await Promise.race<T | "timeout">([
                fn(),
                new Promise<"timeout">((_, reject) => {
                    const t = setTimeout(() => reject(new Error("dns_timeout")), timeoutMs);
                    if (abortSignal) abortSignal.addEventListener("abort", () => {
                        clearTimeout(t);
                        reject(new Error("aborted"));
                    }, { once: true });
                }),
            ]);
            return { label, value };
        } catch (err) {
            return { label, error: (err as NodeJS.ErrnoException).code ?? (err as Error).message };
        }
    };
}

function noop(label: string): SafeRunResult {
    return { label, value: [] };
}

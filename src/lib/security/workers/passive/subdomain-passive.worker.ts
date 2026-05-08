// Subdomain-Passive-Worker — passive Subdomain-Enumeration via Certificate-Transparency-Logs.
//
// Quelle: crt.sh (öffentliches CT-Log-Verzeichnis von Sectigo). Reine OSINT-Anfrage,
// kein Traffic ans Target — daher passive_only-konform. Liefert eine Liste eindeutiger
// Subdomains und meldet sie als `discoveredEntities` zurück; der Playbook-Runner
// upsertet sie als `asset_subdomain` und verknüpft sie mit der Root-Domain
// via `subdomain_of`-Relationship.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";

const CRT_SH_URL = "https://crt.sh/?q=%25.{domain}&output=json";

interface CrtShRow {
    name_value?: string;
    common_name?: string;
}

export const subdomainPassiveWorker: SecurityWorker = {
    jobKey: "subdomain_passive",
    requiredScope: "passive_only",
    description: "Passive Subdomain-Enumeration via crt.sh Certificate-Transparency-Logs (OSINT, kein Traffic am Ziel).",
    defaultTimeoutMs: 45_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "domain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const root = normalizeDomain(ctx.target.value);
        const findings: FindingDraft[] = [];
        const discovered: DiscoveredEntityDraft[] = [];

        try {
            const url = CRT_SH_URL.replace("{domain}", encodeURIComponent(root));
            const controller = new AbortController();
            const onAbort = () => controller.abort();
            ctx.abortSignal?.addEventListener("abort", onAbort, { once: true });
            const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);

            let rows: CrtShRow[] = [];
            try {
                const res = await fetch(url, {
                    method: "GET",
                    signal: controller.signal,
                    headers: {
                        "User-Agent": "node-secu/0.2 (+passive-recon)",
                        "Accept": "application/json",
                    },
                });
                if (!res.ok) {
                    return {
                        success: false,
                        findings,
                        discoveredEntities: discovered,
                        error: `crt.sh HTTP ${res.status}`,
                        durationMs: Date.now() - start,
                    };
                }
                const text = await res.text();
                if (!text.trim()) {
                    rows = [];
                } else {
                    try {
                        rows = JSON.parse(text) as CrtShRow[];
                    } catch {
                        // crt.sh liefert manchmal NDJSON-ähnlich; jede Zeile separat versuchen.
                        rows = text
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line) => safeParse(line))
                            .filter((r): r is CrtShRow => r != null);
                    }
                }
            } finally {
                clearTimeout(timer);
                ctx.abortSignal?.removeEventListener("abort", onAbort);
            }

            const seen = new Set<string>();
            for (const row of rows) {
                const candidates = [row.name_value, row.common_name].filter(Boolean) as string[];
                for (const raw of candidates) {
                    for (const piece of raw.split(/\s+/)) {
                        const cleaned = cleanSubdomainCandidate(piece, root);
                        if (cleaned && !seen.has(cleaned)) {
                            seen.add(cleaned);
                        }
                    }
                }
            }

            for (const sub of seen) {
                if (sub === root) continue;
                discovered.push({
                    kind: "asset_subdomain",
                    primaryValue: sub,
                    displayName: sub,
                    data: { discoveredVia: "crt.sh", parentDomain: root },
                    relationshipToRoot: {
                        kind: "subdomain_of",
                        direction: "from_discovered_to_root",
                        confidence: 90,
                    },
                    source: "recon_crt_sh",
                });
            }

            // Findings: bei "viel Exposure" einen Info-Eintrag, damit der Run nicht still ist.
            if (discovered.length >= 25) {
                findings.push({
                    fingerprintInputs: ["recon", "subdomain_volume", root],
                    severity: "info",
                    category: "exposure",
                    title: `Hohe Subdomain-Anzahl in CT-Logs: ${discovered.length}`,
                    description: `Für ${root} wurden ${discovered.length} eindeutige Subdomains in Certificate-Transparency-Logs gefunden. Hohe Surface-Area — jeder Eintrag ist ein potenzielles Recon-Ziel.`,
                    recommendation: "Inventarisieren: welche dieser Hosts sind aktiv? Stale Subdomains (z.B. CDN-CNAMEs auf gelöschte Buckets) sind klassische Subdomain-Takeover-Vektoren.",
                    evidence: { sampleSubdomains: [...seen].slice(0, 10), totalCount: discovered.length },
                });
            }

            return {
                success: true,
                rawOutput: { source: "crt.sh", rootDomain: root, totalRowsFromSource: rows.length, uniqueSubdomains: discovered.length },
                findings,
                discoveredEntities: discovered,
                durationMs: Date.now() - start,
            };
        } catch (err: unknown) {
            return {
                success: false,
                findings,
                discoveredEntities: discovered,
                error: (err as Error).message,
                durationMs: Date.now() - start,
            };
        }
    },
};

function safeParse(line: string): CrtShRow | null {
    try {
        return JSON.parse(line) as CrtShRow;
    } catch {
        return null;
    }
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

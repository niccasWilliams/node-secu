// DNS-Resolve-Pre-Check — verwendet von active workers (testssl, nmap, nuclei),
// damit tote Subdomains nicht das volle Tool-Timeout blockieren.

import * as dnsPromises from "node:dns/promises";

export interface ResolveResult {
    resolvable: boolean;
    addresses?: string[];
    error?: string;
}

/**
 * Schnelles dns.lookup mit eigenem Timeout. Liefert bei NXDOMAIN/Resolution-Fail
 * resolvable=false in <2s, statt das aufrufende Tool darauf warten zu lassen.
 */
export async function resolveHost(host: string, timeoutMs = 4_000): Promise<ResolveResult> {
    const norm = normalizeHost(host);
    if (!norm) return { resolvable: false, error: "invalid host" };

    try {
        const result = await Promise.race([
            dnsPromises.lookup(norm, { all: true, family: 0 }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`dns lookup timeout after ${timeoutMs}ms`)), timeoutMs),
            ),
        ]);
        const addrs = result.map((r) => r.address);
        return { resolvable: addrs.length > 0, addresses: addrs };
    } catch (err: unknown) {
        const msg = (err as Error).message ?? String(err);
        return { resolvable: false, error: msg };
    }
}

function normalizeHost(input: string): string | null {
    let v = input.trim().toLowerCase();
    if (!v) return null;
    if (v.startsWith("http://") || v.startsWith("https://")) {
        try { v = new URL(v).hostname; } catch { return null; }
    }
    if (v.endsWith(".")) v = v.slice(0, -1);
    return v || null;
}

// Sprint 1.5 (OSINT-Engine, features.md §4.8 / R4) — Hosting-Provider-Klassifikator.
//
// PROBLEM (aus Live-Test L5): Reverse-IP-Pivot ist auf Shared-Cloud-Hosting
// (Cloudflare-Edge, Vercel, Railway, Render) wertlos — alle Customer-Sites
// hängen an denselben IP-Bereichen. Naive Pivots würden Müll liefern.
//
// LÖSUNG: Hardcoded ASN+CIDR-Liste der gängigen Cloud-Hoster + PTR-Pattern-
// Heuristik. Wenn klassifiziert als shared-cloud → Reverse-IP-Pivot
// unterdrücken.
//
// VERHÄLTNIS zur Infrastructure-Provider-Registry (Sprint 1.7):
//   - infrastructure-providers ist die GLOBALE Lookup-DB (DNS/Registrar/CDN/
//     Email/Analytics/Social-Provider) für JEDE Cross-Domain-Pivot-Logik.
//     Worker rufen sie via `infrastructureProviderService.classifyAndPersistIfInfra()`.
//   - hosting-classifier ist die HOSTING-spezifische Hilfs-Sicht — beantwortet
//     ausschliesslich "ist diese IP shared-cloud, dedicated, oder unbekannt?".
//     Kein DB-Zugriff (synchron, in-memory). Wird von Workern lokal genutzt
//     wenn sie eine *Hosting-Eigenschaft* der IP brauchen, nicht "ist Provider X".
//   - Bei Überlapp: hosting-classifier ist Untermenge der Provider-Registry-
//     `hosting`/`cdn`-Kategorien. Konsistent halten, aber kein hard-link.

/** Bekannte shared-cloud / serverless / edge-CDN Provider — IPv4-CIDRs (Stand 2026-Q1). */
const SHARED_HOSTING_RANGES: ReadonlyArray<{ provider: string; cidr: string }> = [
    // Cloudflare-Edge — Common ranges (https://www.cloudflare.com/ips-v4)
    { provider: "cloudflare", cidr: "104.16.0.0/13" },
    { provider: "cloudflare", cidr: "104.24.0.0/14" },
    { provider: "cloudflare", cidr: "172.64.0.0/13" },
    { provider: "cloudflare", cidr: "162.158.0.0/15" },
    { provider: "cloudflare", cidr: "131.0.72.0/22" },
    { provider: "cloudflare", cidr: "108.162.192.0/18" },
    { provider: "cloudflare", cidr: "103.21.244.0/22" },
    { provider: "cloudflare", cidr: "103.22.200.0/22" },
    { provider: "cloudflare", cidr: "103.31.4.0/22" },
    { provider: "cloudflare", cidr: "141.101.64.0/18" },
    { provider: "cloudflare", cidr: "190.93.240.0/20" },
    { provider: "cloudflare", cidr: "188.114.96.0/20" },
    { provider: "cloudflare", cidr: "197.234.240.0/22" },
    { provider: "cloudflare", cidr: "198.41.128.0/17" },
    // Railway
    { provider: "railway", cidr: "66.33.22.0/24" },
    // Vercel
    { provider: "vercel", cidr: "76.76.21.0/24" },
    { provider: "vercel", cidr: "76.76.16.0/20" },
    // Render
    { provider: "render", cidr: "35.227.0.0/16" },
    { provider: "render", cidr: "216.24.57.0/24" },
    // Netlify
    { provider: "netlify", cidr: "52.84.0.0/15" },
    // GitHub Pages
    { provider: "github_pages", cidr: "185.199.108.0/22" },
    // Fly.io
    { provider: "fly_io", cidr: "66.241.124.0/24" },
    { provider: "fly_io", cidr: "137.66.0.0/16" },
    // AWS-CloudFront — sample edge IPs (vollständige Liste pflegt AWS dynamisch).
    { provider: "aws_cloudfront", cidr: "13.224.0.0/14" },
    { provider: "aws_cloudfront", cidr: "52.46.0.0/18" },
    // Heroku
    { provider: "heroku", cidr: "23.21.0.0/16" },
    { provider: "heroku", cidr: "50.16.0.0/15" },
];

/** Bekannte ASN-Nummern shared-cloud Provider — als Sekundär-Signal, wenn IP nicht im CIDR-Set ist. */
const SHARED_HOSTING_ASNS: ReadonlyArray<{ provider: string; asn: number }> = [
    { provider: "cloudflare", asn: 13335 },
    { provider: "amazon_aws", asn: 16509 },
    { provider: "amazon_aws", asn: 14618 },
    { provider: "amazon_cloudfront", asn: 16509 },
    { provider: "google_cloud", asn: 15169 },
    { provider: "google_cloud", asn: 396982 },
    { provider: "microsoft_azure", asn: 8075 },
    { provider: "microsoft_azure", asn: 8068 },
    { provider: "fastly", asn: 54113 },
    { provider: "akamai", asn: 16625 },
    { provider: "akamai", asn: 20940 },
    { provider: "vercel", asn: 64475 },
    { provider: "netlify", asn: 396982 },
    { provider: "fly_io", asn: 200768 },
    { provider: "github_pages", asn: 36459 },
    { provider: "ovh", asn: 16276 },
    { provider: "hetzner", asn: 24940 },
    { provider: "digitalocean", asn: 14061 },
    { provider: "linode", asn: 63949 },
];

/** Reverse-DNS-PTR-Patterns die eindeutig auf shared-cloud zeigen. */
const SHARED_PTR_PATTERNS: ReadonlyArray<{ provider: string; pattern: RegExp }> = [
    { provider: "amazon_aws", pattern: /\.amazonaws\.com$/i },
    { provider: "amazon_cloudfront", pattern: /\.cloudfront\.net$/i },
    { provider: "amazon_aws", pattern: /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/i },
    { provider: "google_cloud", pattern: /\.googleusercontent\.com$/i },
    { provider: "google_cloud", pattern: /\.googleapis\.com$/i },
    { provider: "microsoft_azure", pattern: /\.azurewebsites\.net$/i },
    { provider: "microsoft_azure", pattern: /\.cloudapp\.(?:azure\.com|net)$/i },
    { provider: "fly_io", pattern: /\.fly\.dev$/i },
    { provider: "vercel", pattern: /\.vercel\.app$/i },
    { provider: "railway", pattern: /\.railway\.app$/i },
    { provider: "render", pattern: /\.onrender\.com$/i },
    { provider: "netlify", pattern: /\.netlify\.app$/i },
    { provider: "heroku", pattern: /\.herokuapp\.com$/i },
    { provider: "github_pages", pattern: /\.github\.io$/i },
    { provider: "cloudflare", pattern: /\.cloudflare\.com$/i },
];

export interface HostingClassification {
    /** Bekannter Provider-Slug oder null wenn nichts matched. */
    provider: string | null;
    /** True wenn Provider als shared/serverless gilt — Reverse-IP-Pivot vermeiden. */
    isShared: boolean;
    /** "cidr" | "asn" | "ptr" — welche Achse hat den Hit gegeben. */
    matchedVia: "cidr" | "asn" | "ptr" | null;
    /** Konkrete Match-Quelle, z.B. "104.16.0.0/13" oder "13335" oder ".amazonaws.com". */
    matchPattern: string | null;
}

export interface ClassifyByPtrInput {
    ptr: string;
}

export interface ClassifyByIpInput {
    /** IPv4-Dotted-Notation. */
    ip: string;
    /** Optional, falls bekannt — verbessert Match-Coverage. */
    asn?: number;
    /** Optional Reverse-DNS-PTR. */
    ptr?: string;
}

export const hostingClassifier = {
    classifyByIp(input: ClassifyByIpInput): HostingClassification {
        if (input.ip) {
            const cidrHit = matchCidr(input.ip);
            if (cidrHit) {
                return { provider: cidrHit.provider, isShared: true, matchedVia: "cidr", matchPattern: cidrHit.cidr };
            }
        }
        if (typeof input.asn === "number") {
            const asnHit = SHARED_HOSTING_ASNS.find((a) => a.asn === input.asn);
            if (asnHit) {
                return { provider: asnHit.provider, isShared: true, matchedVia: "asn", matchPattern: String(asnHit.asn) };
            }
        }
        if (input.ptr) {
            const ptrHit = matchPtr(input.ptr);
            if (ptrHit) {
                return { provider: ptrHit.provider, isShared: true, matchedVia: "ptr", matchPattern: ptrHit.pattern.source };
            }
        }
        return { provider: null, isShared: false, matchedVia: null, matchPattern: null };
    },

    classifyByPtr(input: ClassifyByPtrInput): HostingClassification {
        const hit = matchPtr(input.ptr);
        if (hit) {
            return { provider: hit.provider, isShared: true, matchedVia: "ptr", matchPattern: hit.pattern.source };
        }
        return { provider: null, isShared: false, matchedVia: null, matchPattern: null };
    },

    /** Diagnose: alle bekannten Provider-Slugs (für Reports). */
    knownProviders(): string[] {
        const set = new Set<string>();
        for (const r of SHARED_HOSTING_RANGES) set.add(r.provider);
        for (const r of SHARED_HOSTING_ASNS) set.add(r.provider);
        for (const r of SHARED_PTR_PATTERNS) set.add(r.provider);
        return [...set].sort();
    },
};

function matchCidr(ip: string): { provider: string; cidr: string } | null {
    const ipNum = ipv4ToInt(ip);
    if (ipNum == null) return null;
    let best: { provider: string; cidr: string; prefix: number } | null = null;
    for (const r of SHARED_HOSTING_RANGES) {
        const parsed = parseCidr(r.cidr);
        if (!parsed) continue;
        if ((ipNum & parsed.mask) === parsed.network) {
            if (!best || parsed.prefix > best.prefix) {
                best = { provider: r.provider, cidr: r.cidr, prefix: parsed.prefix };
            }
        }
    }
    return best ? { provider: best.provider, cidr: best.cidr } : null;
}

function matchPtr(ptr: string): { provider: string; pattern: RegExp } | null {
    if (!ptr) return null;
    const cleaned = ptr.toLowerCase().replace(/\.$/, "");
    for (const p of SHARED_PTR_PATTERNS) {
        if (p.pattern.test(cleaned)) return p;
    }
    return null;
}

function ipv4ToInt(ip: string): number | null {
    const parts = ip.trim().split(".");
    if (parts.length !== 4) return null;
    let result = 0;
    for (const p of parts) {
        const n = Number(p);
        if (!Number.isInteger(n) || n < 0 || n > 255) return null;
        result = (result * 256 + n) >>> 0;
    }
    return result;
}

function parseCidr(cidr: string): { network: number; mask: number; prefix: number } | null {
    const [ip, prefixStr] = cidr.split("/");
    const prefix = Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
    const ipNum = ipv4ToInt(ip);
    if (ipNum == null) return null;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return { network: ipNum & mask, mask, prefix };
}

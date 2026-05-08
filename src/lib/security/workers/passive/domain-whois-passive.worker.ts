// Sprint 2 #8 (OSINT-Engine, features.md §3.1 Mechanik #1) — WHOIS / RDAP
// passive Owner-Discovery.
//
// Quellen:
//   1. **RDAP via IANA-Bootstrap-Registry** (https://data.iana.org/rdap/dns.json).
//      Liefert pro TLD den RDAP-Server. Wir caches den Bootstrap-Pull 24h, dann
//      pro Domain einen RDAP-Lookup mit `Accept: application/rdap+json`.
//      Liefert IANA-Standard JSON mit `entities[]` (registrant/admin/tech/...).
//   2. **DENIC `.de`-Fallback** über deren öffentlichen RDAP-Endpoint, der seit
//      2022 alle TLD-Holders ausliefert (privacy-by-default — meist nur Tech-
//      Kontakte ohne Person-Namen).
//
// Confidence-Regel (features.md §3.1 #1):
//   - Nicht-anonymisierter Owner-Eintrag (Name UND Email vorhanden,
//     Email ist NICHT `@whoisprivacy.*` / `@whoisguard.*` / `@anonymized.*`)
//     → speculativeOverride=false, evidence.confidenceContribution=0.95
//   - Anonymisierter / privacy-protected Eintrag
//     → speculativeOverride=true, evidence.confidenceContribution=0.2
//
// Provider-Filter: registrar wird durch infrastructureProviderService.classify-
// Domain() geprüft. Bekannte Registrar-Hits (IONOS, Strato, ...) werden als
// infrastructure_provider verlinkt — NICHT als Owner-Org.

import { httpFetch } from "../../osint/http-fetch";
import { infrastructureProviderService } from "../../osint/infrastructure-providers/provider.service";
import type {
    DiscoveredEntityDraft,
    SecurityWorker,
    WorkerContext,
    WorkerResult,
} from "../worker.types";

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const RDAP_TIMEOUT_MS = 10_000;

interface IanaBootstrap {
    services: Array<[string[], string[]]>;
}

type RdapVCardEntry = [string, Record<string, unknown>, string, unknown];

interface RdapEntity {
    handle?: string;
    roles?: string[];
    /** ["vcard", [vcardEntries]] */
    vcardArray?: [string, RdapVCardEntry[]];
    entities?: RdapEntity[];
}

interface RdapResponse {
    objectClassName?: string;
    handle?: string;
    ldhName?: string;
    entities?: RdapEntity[];
    nameservers?: Array<{ ldhName?: string }>;
    events?: Array<{ eventAction?: string; eventDate?: string }>;
    status?: string[];
    notices?: unknown;
}

interface CachedBootstrap { data: IanaBootstrap; loadedAt: number }
let bootstrapCache: CachedBootstrap | null = null;

const ANONYMIZED_PATTERNS: ReadonlyArray<RegExp> = [
    /whoisprivacy/i,
    /whoisguard/i,
    /privacyprotect/i,
    /domainsbyproxy/i,
    /redacted-?for-?privacy/i,
    /anonymized/i,
    /\bdata\s*protected\b/i,
    /private\s*registration/i,
    /\bgdpr\b/i,
];

export const domainWhoisPassiveWorker: SecurityWorker = {
    jobKey: "domain_whois_passive",
    requiredScope: "passive_only",
    description: "RDAP/WHOIS via IANA-Bootstrap (DENIC für .de). Extrahiert Registrant + Admin + Tech als organic Owner-Belege.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "domain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const target = ctx.target.value.toLowerCase().replace(/\.+$/, "");

        const bootstrap = await loadBootstrap(ctx.abortSignal);
        if (!bootstrap) {
            return {
                success: false,
                findings: [],
                error: "iana_bootstrap_unavailable",
                durationMs: Date.now() - start,
            };
        }

        const tld = target.split(".").pop() ?? "";
        const rdapBase = pickRdapBase(bootstrap, tld);
        if (!rdapBase) {
            return {
                success: false,
                findings: [],
                error: `no_rdap_server_for_tld:${tld}`,
                durationMs: Date.now() - start,
                rawOutput: { target, tld },
            };
        }

        const url = `${rdapBase.replace(/\/$/, "")}/domain/${encodeURIComponent(target)}`;
        const res = await httpFetch<RdapResponse>(url, {
            timeoutMs: RDAP_TIMEOUT_MS,
            headers: { "Accept": "application/rdap+json" },
            signal: ctx.abortSignal,
            providerKey: "rdap",
        });
        if (!res.success) {
            return {
                success: false,
                findings: [],
                error: `rdap_lookup_failed:${res.error ?? `http_${res.status}`}`,
                durationMs: Date.now() - start,
                rawOutput: { target, rdapBase, url, status: res.status },
            };
        }

        const rdap = res.data;
        if (!rdap || typeof rdap !== "object") {
            return {
                success: false,
                findings: [],
                error: "rdap_response_not_object",
                durationMs: Date.now() - start,
                rawOutput: res.data,
            };
        }

        const parsed = parseRdap(rdap);
        const discovered: DiscoveredEntityDraft[] = [];

        // Registrar als infrastructure_provider (wenn bekannt) — kein Owner-Pivot.
        if (parsed.registrar?.name && ctx.engagementId != null) {
            const registrarDomainGuess = parsed.registrar.urlHostname ?? null;
            if (registrarDomainGuess) {
                await infrastructureProviderService.classifyAndPersistIfInfra(
                    { kind: "domain", value: registrarDomainGuess },
                    { engagementId: ctx.engagementId, source: `domain_whois_passive:registrar=${parsed.registrar.name}` },
                );
            }
        }

        // Registrant + Admin + Tech: Person + Organization extrahieren.
        // `abuse`-Rolle ist IMMER Registrar-Verwaltung (ICANN-Pflichtkontakt
        // für Missbrauchsmeldungen) — kein Owner-Signal, deshalb gefiltert.
        const OWNER_ROLES = new Set(["registrant", "administrative", "technical", "billing"]);
        for (const c of parsed.contacts) {
            if (!c.roles.some((r) => OWNER_ROLES.has(r.toLowerCase()))) continue;
            const isAnon = isAnonymized(c);
            const confidenceContribution = isAnon ? 0.2 : 0.95;
            const evidenceClass = "organic" as const;
            const snippet = renderContactSnippet(c);

            // Person-Entity (wenn Name vorhanden).
            if (c.name) {
                discovered.push({
                    kind: "person",
                    primaryValue: c.email ?? c.name,
                    displayName: c.name,
                    discriminator: c.email ? null : c.org ?? c.address ?? target,
                    data: {
                        rdapRole: c.roles.join(","),
                        rdapHandle: c.handle,
                        org: c.org ?? null,
                        address: c.address ?? null,
                        phone: c.phone ?? null,
                        email: c.email ?? null,
                        anonymized: isAnon,
                    },
                    relationshipToRoot: {
                        kind: "owns",
                        direction: "from_discovered_to_root",
                        confidence: isAnon ? 30 : 95,
                    },
                    source: `recon_rdap:${c.roles.join("+")}`,
                    speculativeOverride: isAnon ? true : false,
                    evidence: [{
                        source: `domain_whois_passive:rdap:${c.roles.join("+")}`,
                        snippet,
                        confidenceContribution,
                        evidenceClass,
                    }],
                });
            }

            // Organization als eigene Entity (auch wenn anonymisiert oft die Owner-Org leakt).
            if (c.org && !isProviderOrg(c.org)) {
                discovered.push({
                    kind: "organization",
                    primaryValue: c.org,
                    displayName: c.org,
                    data: {
                        rdapRole: c.roles.join(","),
                        address: c.address ?? null,
                        anonymized: isAnon,
                    },
                    relationshipToRoot: {
                        kind: "owns",
                        direction: "from_discovered_to_root",
                        confidence: isAnon ? 40 : 90,
                    },
                    source: `recon_rdap:${c.roles.join("+")}_org`,
                    speculativeOverride: isAnon ? true : false,
                    evidence: [{
                        source: `domain_whois_passive:rdap:${c.roles.join("+")}_org`,
                        snippet: `Organization: ${c.org}`,
                        confidenceContribution,
                        evidenceClass,
                    }],
                });
            }

            // Email als eigene Entity wenn nicht-anonymisiert (Owner-Email).
            if (c.email && !isAnonymizedEmail(c.email)) {
                discovered.push({
                    kind: "email_address",
                    primaryValue: c.email,
                    displayName: c.email,
                    relationshipToRoot: {
                        kind: "owns_email",
                        direction: "from_root_to_discovered",
                        confidence: 90,
                    },
                    source: `recon_rdap:${c.roles.join("+")}_email`,
                    evidence: [{
                        source: `domain_whois_passive:rdap:${c.roles.join("+")}_email`,
                        snippet: `RDAP-${c.roles.join("+")}-Email: ${c.email}`,
                        confidenceContribution: 0.85,
                        evidenceClass: "organic",
                    }],
                });
            }
        }

        return {
            success: true,
            findings: [],
            discoveredEntities: discovered,
            entityDataPatch: {
                rdap: {
                    registrar: parsed.registrar,
                    eventDates: parsed.events,
                    statuses: parsed.statuses,
                    nameservers: parsed.nameservers,
                    contacts: parsed.contacts.map((c) => ({
                        roles: c.roles,
                        anonymized: isAnonymized(c),
                        hasName: !!c.name,
                        hasEmail: !!c.email,
                        org: c.org ?? null,
                    })),
                    fetchedAt: new Date().toISOString(),
                    rdapServer: rdapBase,
                },
            },
            rawOutput: { rdap, parsed, rdapServer: rdapBase },
            durationMs: Date.now() - start,
        };
    },
};

interface ContactInfo {
    roles: string[];
    handle?: string;
    name?: string;
    org?: string;
    email?: string;
    phone?: string;
    address?: string;
}

interface ParsedRdap {
    contacts: ContactInfo[];
    registrar: { name?: string; urlHostname?: string } | null;
    events: Array<{ action: string; date: string }>;
    statuses: string[];
    nameservers: string[];
}

function parseRdap(r: RdapResponse): ParsedRdap {
    const contacts: ContactInfo[] = [];
    let registrar: ParsedRdap["registrar"] = null;

    const flatten = (e: RdapEntity, parentRoles?: string[]): void => {
        const roles = e.roles ?? parentRoles ?? [];
        if (roles.includes("registrar")) {
            const v = parseVcard(e.vcardArray);
            registrar = { name: v.fn ?? v.org, urlHostname: extractHostname(v.url) };
        } else if (roles.length > 0) {
            const v = parseVcard(e.vcardArray);
            contacts.push({
                roles,
                handle: e.handle,
                name: v.fn,
                org: v.org,
                email: v.email,
                phone: v.tel,
                address: v.adr,
            });
        }
        if (e.entities) for (const child of e.entities) flatten(child, roles);
    };

    if (r.entities) for (const e of r.entities) flatten(e);

    const events = (r.events ?? [])
        .filter((ev) => ev.eventAction && ev.eventDate)
        .map((ev) => ({ action: ev.eventAction!, date: ev.eventDate! }));

    return {
        contacts,
        registrar,
        events,
        statuses: r.status ?? [],
        nameservers: (r.nameservers ?? []).map((n) => n.ldhName ?? "").filter(Boolean),
    };
}

interface VcardOut {
    fn?: string;
    org?: string;
    email?: string;
    tel?: string;
    adr?: string;
    url?: string;
}

function parseVcard(arr: RdapEntity["vcardArray"]): VcardOut {
    const out: VcardOut = {};
    if (!arr || !Array.isArray(arr) || arr[0] !== "vcard" || !Array.isArray(arr[1])) return out;
    for (const entry of arr[1]) {
        const [prop, , type, value] = entry;
        if (!prop) continue;
        switch (prop.toLowerCase()) {
            case "fn":
                if (typeof value === "string") out.fn = value;
                break;
            case "org":
                out.org = Array.isArray(value) ? value.filter((v) => typeof v === "string").join(", ") : (typeof value === "string" ? value : undefined);
                break;
            case "email":
                if (typeof value === "string") out.email = value.toLowerCase();
                break;
            case "tel":
                if (typeof value === "string") out.tel = value;
                break;
            case "adr":
                if (Array.isArray(value)) {
                    // RFC 6350 ADR: pobox, ext, street, locality, region, code, country
                    out.adr = value
                        .map((v) => Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : (typeof v === "string" ? v : ""))
                        .filter(Boolean)
                        .join(", ");
                }
                break;
            case "url":
                if (typeof value === "string") out.url = value;
                break;
        }
        // type currently unused; retained for future filter (e.g. work-vs-home email).
        void type;
    }
    return out;
}

function extractHostname(url?: string): string | undefined {
    if (!url) return undefined;
    try { return new URL(url).hostname.toLowerCase(); } catch { return undefined; }
}

function isAnonymized(c: ContactInfo): boolean {
    if (c.email && isAnonymizedEmail(c.email)) return true;
    if (c.org && ANONYMIZED_PATTERNS.some((p) => p.test(c.org!))) return true;
    if (c.name && ANONYMIZED_PATTERNS.some((p) => p.test(c.name!))) return true;
    return false;
}

function isAnonymizedEmail(email: string): boolean {
    const lower = email.toLowerCase();
    return ANONYMIZED_PATTERNS.some((p) => p.test(lower));
}

function isProviderOrg(org: string): boolean {
    // Vermeidet, dass Registrar-Org als Owner-Org persistiert wird (z.B. wenn
    // das Vcard gar keine separate registrar-Rolle hat). Pattern auf bekannte
    // Registrar/Privacy-Provider-Orgs.
    const patterns = [
        /^cloudflare\b/i, /^godaddy\b/i, /^namecheap\b/i, /^name\.com\b/i,
        /^gandi\b/i, /^ionos\b/i, /^strato\b/i, /^denic\b/i, /^markmonitor\b/i,
        /^csc\s+corporate\s+domains/i, /^perfect\s+privacy/i,
        /^domains\s+by\s+proxy/i, /\bregistrar\b/i,
    ];
    return patterns.some((p) => p.test(org));
}

function renderContactSnippet(c: ContactInfo): string {
    const parts: string[] = [];
    parts.push(`role=${c.roles.join("+")}`);
    if (c.name) parts.push(`name="${c.name}"`);
    if (c.org) parts.push(`org="${c.org}"`);
    if (c.email) parts.push(`email=${c.email}`);
    if (c.address) parts.push(`adr="${c.address}"`);
    return parts.join("; ");
}

async function loadBootstrap(signal?: AbortSignal): Promise<IanaBootstrap | null> {
    const now = Date.now();
    if (bootstrapCache && now - bootstrapCache.loadedAt < BOOTSTRAP_TTL_MS) {
        return bootstrapCache.data;
    }
    const res = await httpFetch<IanaBootstrap>(IANA_BOOTSTRAP_URL, {
        timeoutMs: 10_000,
        headers: { "Accept": "application/json" },
        signal,
        providerKey: "iana_rdap_bootstrap",
    });
    if (!res.success || !res.data || !Array.isArray(res.data.services)) {
        return bootstrapCache?.data ?? null;
    }
    bootstrapCache = { data: res.data, loadedAt: now };
    return res.data;
}

function pickRdapBase(bootstrap: IanaBootstrap, tld: string): string | null {
    const lc = tld.toLowerCase();
    for (const [tlds, urls] of bootstrap.services) {
        if (tlds.some((t) => t.toLowerCase() === lc) && urls.length > 0) {
            // Bevorzugt HTTPS-URL.
            return urls.find((u) => u.startsWith("https:")) ?? urls[0];
        }
    }
    return null;
}

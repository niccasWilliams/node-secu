// Sprint 1.7 (features.md §2.8) — Infrastructure-Provider-Service.
//
// Globaler Classifier, den OSINT-Worker VOR jedem Cross-Domain- oder
// Owner-Pivot konsultieren. Wenn ein Hit als Infrastruktur-Provider
// klassifiziert wird (Cloudflare-NS, Railway-IP, Google-Analytics-Snippet
// usw.), wird er als entity.kind='infrastructure_provider' persistiert
// — aber NICHT als Owner-Hypothese ins Pivot-System eingespeist.
//
// Architektur:
//   - DB-Tabelle secu_infrastructure_providers (Sprint 1.7 schema)
//   - In-Memory-Cache mit 5min TTL (Tabelle ist klein, ~70 Einträge)
//   - Multi-Match-API: classifyDomain / classifyHost / classifyAsn /
//     classifyIpv4 / classifyNsHost / classifyHtmlAssetHost / classifyEmailDomain
//   - Worker-Helper classifyAndPersistIfInfra() upsertet Entity + verlinkt
//     in's Engagement, gibt {isInfra: true|false} zurück. Worker entscheidet
//     auf isInfra=true → KEIN Owner-Pivot, KEIN Cross-Domain-Trigger.
//
// Test-Helper _resetCacheForTests() nicht vergessen — der Cache überlebt
// sonst Test-Suite-Boundaries.

import { and, eq } from "drizzle-orm";
import { database } from "@/db";
import {
    engagementEntities,
    entities,
    infrastructureProviders,
    type Entity,
    type InfrastructureProvider,
    type InfraProviderMatchPatterns,
    type InfrastructureProviderCategory,
    type InfrastructureProviderEntityData,
} from "@/db/individual/individual-schema";
import { entityService } from "@/lib/security/entities/entity.service";
import { cidrMatchesIpv4 } from "./cidr-match";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { providers: InfrastructureProvider[]; loadedAt: number } | null = null;

async function loadProviders(force = false): Promise<InfrastructureProvider[]> {
    const now = Date.now();
    if (!force && cache && now - cache.loadedAt < CACHE_TTL_MS) {
        return cache.providers;
    }
    const rows = await database
        .select()
        .from(infrastructureProviders)
        .where(eq(infrastructureProviders.isActive, true));
    cache = { providers: rows, loadedAt: now };
    return rows;
}

function normalizeHost(host: string): string {
    return host.trim().toLowerCase().replace(/\.+$/, "");
}

function suffixMatchLength(host: string, suffix: string): number {
    // Match wenn host == suffix ODER host endet auf "." + suffix.
    // Returns Länge des matchten Suffixes (für most-specific-wins). 0 = kein Match.
    // Führende Dots im Suffix-Pattern werden toleriert (".ns.cloudflare.com"
    // == "ns.cloudflare.com") — Convention im Seed darf beides.
    const h = normalizeHost(host);
    const s = normalizeHost(suffix).replace(/^\.+/, "");
    if (!s) return 0;
    if (h === s) return s.length;
    if (h.endsWith(`.${s}`)) return s.length;
    return 0;
}

export type ClassifyMatchVia =
    | "domain"
    | "asn"
    | "cidr"
    | "ns_host"
    | "html_asset_host"
    | "email_domain";

export interface ClassifyHit {
    isInfra: true;
    provider: InfrastructureProvider;
    matchedVia: ClassifyMatchVia;
    matchPattern: string;
    /** specificity-Wert (Suffix-Länge / 32-prefix etc.) — für Tie-Break. */
    specificity: number;
}

export interface ClassifyMiss {
    isInfra: false;
}

export type ClassifyResult = ClassifyHit | ClassifyMiss;

/**
 * Wählt den spezifischsten Match aus einer Liste — längstes Pattern wins.
 * Bei Gleichstand kommt der erste Eintrag durch (DB-Order).
 */
function pickMostSpecific(hits: ClassifyHit[]): ClassifyHit | null {
    if (hits.length === 0) return null;
    return hits.reduce((best, cur) => (cur.specificity > best.specificity ? cur : best));
}

async function classifyByPattern<P extends keyof InfraProviderMatchPatterns>(
    patternKey: P,
    matchedVia: ClassifyMatchVia,
    matcher: (input: string, pattern: NonNullable<InfraProviderMatchPatterns[P]>[number]) => number,
    input: string,
): Promise<ClassifyResult> {
    const providers = await loadProviders();
    const hits: ClassifyHit[] = [];
    for (const p of providers) {
        const arr = (p.matchPatterns?.[patternKey] ?? []) as Array<NonNullable<InfraProviderMatchPatterns[P]>[number]>;
        if (!Array.isArray(arr) || arr.length === 0) continue;
        for (const pattern of arr) {
            const spec = matcher(input, pattern);
            if (spec > 0) {
                hits.push({
                    isInfra: true,
                    provider: p,
                    matchedVia,
                    matchPattern: String(pattern),
                    specificity: spec,
                });
            }
        }
    }
    const best = pickMostSpecific(hits);
    return best ?? { isInfra: false };
}

export const infrastructureProviderService = {
    async loadAll(force = false): Promise<InfrastructureProvider[]> {
        return loadProviders(force);
    },

    /** Forciert Cache-Reload — nach Operator-CRUD-Mutationen. */
    invalidateCache(): void {
        cache = null;
    },

    /**
     * Match gegen domainSuffixes. Verwendet von WHOIS, Impressum-NER
     * (Cross-Domain-Mentions), Cert-SAN-Sharing-Pivot.
     */
    async classifyDomain(domain: string): Promise<ClassifyResult> {
        if (!domain) return { isInfra: false };
        return classifyByPattern("domainSuffixes", "domain", suffixMatchLength, domain);
    },

    /**
     * Generischer Hostname-Match — versucht erst domainSuffixes, dann nsSuffixes,
     * dann htmlAssetHosts. Für Worker, die nur "irgendein Hostname" haben und
     * kein Wissen über die Quelle.
     */
    async classifyHost(host: string): Promise<ClassifyResult> {
        if (!host) return { isInfra: false };
        const dom = await this.classifyDomain(host);
        if (dom.isInfra) return dom;
        const ns = await this.classifyNsHost(host);
        if (ns.isInfra) return ns;
        return this.classifyHtmlAssetHost(host);
    },

    /** ASN-Match — exact equal. */
    async classifyAsn(asn: number): Promise<ClassifyResult> {
        if (!Number.isFinite(asn) || asn <= 0) return { isInfra: false };
        const providers = await loadProviders();
        for (const p of providers) {
            const list = p.matchPatterns?.asnNumbers ?? [];
            if (list.includes(asn)) {
                return {
                    isInfra: true,
                    provider: p,
                    matchedVia: "asn",
                    matchPattern: `AS${asn}`,
                    specificity: 1,
                };
            }
        }
        return { isInfra: false };
    },

    /** IPv4-Match gegen cidrRanges. Längster Prefix wins. */
    async classifyIpv4(ip: string): Promise<ClassifyResult> {
        if (!ip) return { isInfra: false };
        const providers = await loadProviders();
        const hits: ClassifyHit[] = [];
        for (const p of providers) {
            const ranges = p.matchPatterns?.cidrRanges ?? [];
            for (const cidr of ranges) {
                if (cidrMatchesIpv4(ip, cidr)) {
                    const prefix = Number(cidr.split("/")[1] ?? "0");
                    hits.push({
                        isInfra: true,
                        provider: p,
                        matchedVia: "cidr",
                        matchPattern: cidr,
                        specificity: Number.isFinite(prefix) ? prefix : 0,
                    });
                }
            }
        }
        const best = pickMostSpecific(hits);
        return best ?? { isInfra: false };
    },

    /** Match gegen nsSuffixes. Verwendet vom DNS-NS-Worker (Cloudflare-NS-Pair etc.). */
    async classifyNsHost(nsHost: string): Promise<ClassifyResult> {
        if (!nsHost) return { isInfra: false };
        return classifyByPattern("nsSuffixes", "ns_host", suffixMatchLength, nsHost);
    },

    /** Match gegen htmlAssetHosts. Tracking-IDs/CDN-Snippets. */
    async classifyHtmlAssetHost(host: string): Promise<ClassifyResult> {
        if (!host) return { isInfra: false };
        return classifyByPattern("htmlAssetHosts", "html_asset_host", (h, pat) => {
            // exact-host-match (Tracking-Snippets sind exakt, kein Suffix-Wildcard).
            return normalizeHost(h) === normalizeHost(pat) ? pat.length : 0;
        }, host);
    },

    /** Match gegen emailDomains — MX-Targets, SPF-Includes. */
    async classifyEmailDomain(emailDomain: string): Promise<ClassifyResult> {
        if (!emailDomain) return { isInfra: false };
        // Email-Provider-Patterns sind oft mehr-segment (aspmx.l.google.com),
        // also Suffix-Match analog domain.
        return classifyByPattern("emailDomains", "email_domain", suffixMatchLength, emailDomain);
    },

    /**
     * Worker-Helper — klassifiziert, persistiert (wenn Hit) und verlinkt ins
     * Engagement. Idempotent über entity-canonical-key (provider:<key>).
     *
     * WICHTIG: bei isInfra=true MUSS der Worker den Owner-/Cross-Domain-Pivot
     * für diesen Hit unterdrücken. Der returnierte Entity ist nur Kontext-
     * Information für Reports + Tech-Stack-Sicht.
     */
    async classifyAndPersistIfInfra(
        input: { kind: ClassifyMatchVia; value: string },
        ctx: { engagementId: number; source: string },
    ): Promise<{ isInfra: boolean; provider?: InfrastructureProvider; entity?: Entity }> {
        let result: ClassifyResult;
        switch (input.kind) {
            case "domain":
                result = await this.classifyDomain(input.value);
                break;
            case "asn": {
                const asn = Number(input.value);
                result = await this.classifyAsn(asn);
                break;
            }
            case "cidr":
                result = await this.classifyIpv4(input.value);
                break;
            case "ns_host":
                result = await this.classifyNsHost(input.value);
                break;
            case "html_asset_host":
                result = await this.classifyHtmlAssetHost(input.value);
                break;
            case "email_domain":
                result = await this.classifyEmailDomain(input.value);
                break;
            default:
                return { isInfra: false };
        }

        if (!result.isInfra) return { isInfra: false };

        const data: InfrastructureProviderEntityData = {
            providerId: result.provider.id,
            providerKey: result.provider.key,
            providerName: result.provider.name,
            category: result.provider.category,
            matchedVia: result.matchedVia,
            matchPattern: result.matchPattern,
            matchSource: ctx.source,
            lastObservedAt: new Date().toISOString(),
        };

        const entity = await entityService.upsert({
            kind: "infrastructure_provider",
            displayName: result.provider.name,
            canonical: {
                kind: "infrastructure_provider",
                primaryValue: `provider:${result.provider.key}`,
            },
            data: data as unknown as Record<string, unknown>,
        });

        // Link ins Engagement (idempotent — pair unique constraint fängt Doppelte ab).
        await database
            .insert(engagementEntities)
            .values({
                engagementId: ctx.engagementId,
                entityId: entity.id,
                role: "context",
                notes: `Auto-classified as ${result.provider.category} via ${result.matchedVia}=${result.matchPattern}`,
            })
            .onConflictDoNothing();

        return { isInfra: true, provider: result.provider, entity };
    },

    // ─── Operator-CRUD (für POST/PATCH/DELETE-Routen, falls später gebraucht) ──

    async list(category?: InfrastructureProviderCategory): Promise<InfrastructureProvider[]> {
        const all = await loadProviders(true);
        return category ? all.filter((p) => p.category === category) : all;
    },

    async getByKey(key: string): Promise<InfrastructureProvider | null> {
        const [row] = await database
            .select()
            .from(infrastructureProviders)
            .where(and(eq(infrastructureProviders.key, key)))
            .limit(1);
        return row ?? null;
    },

    /** Test-Helper: Cache resetten zwischen Test-Suiten. */
    _resetCacheForTests(): void {
        cache = null;
    },
};

// canonical-key needs to recognize infrastructure_provider — wir nutzen das
// "provider:<key>"-Schema als canonical.value, das durch das default-toLowerCase
// in buildCanonicalKey idempotent bleibt.

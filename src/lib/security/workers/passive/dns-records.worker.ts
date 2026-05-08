// DNS-Records-Worker — passive Domain-Health-Checks + Owner-Signal-Mining.
//
// Phase 2 (Initial): SPF, DKIM-Hint, DMARC, MX, DNSSEC-Hint, CAA als Findings.
//   Recycelt aus node-boss/src/lib/cloudflare/domain-health.service.ts.
//
// Sprint 2 #7 (OSINT-Engine, features.md §3.1 Mechanik #10/#11a, L8) —
// erweitert um:
//
//   1. **DMARC `rua=`/`ruf=`-Email-Extract** (Mechanik #11a, L8). Live-Test
//      2026-05-08 fand `support@orvello.de` AUSSCHLIESSLICH über diesen Vektor —
//      Owner-Email steht oft nur im DMARC-Aggregate-Report-Empfänger. Jede
//      Email wird als kind=email_address discovered, mit Provenance:
//      `evidenceClass=organic`, `confidenceContribution=0.7` (DMARC-RUA ist
//      Owner-Email-Adresse im engsten Sinne, kaum False-Positive).
//
//   2. **DNS-TXT-Verifications-Pivot** (Mechanik #10). Tokens wie
//      `google-site-verification`, `MS=ms…`, `apple-domain-verification` etc.
//      sind global-eindeutig pro Account. Persistiert in
//      `secu_dns_verification_pivots`. Sprint 5 nutzt das für Cross-Domain-
//      Owner-Pivots.
//
//   3. **NS-Pair via classifyNsHost()** (features.md §2.8 + §3.1-Footnote).
//      Jeder NS-Host läuft erst durch `infrastructureProviderService.classify`
//      AndPersistIfInfra() — bekannte DNS-Provider (Cloudflare, AWS Route53,
//      DENIC, ...) werden als infrastructure_provider-Entity verlinkt
//      (role=context). Cloudflare-NS-Pair wird zusätzlich in
//      `secu_dns_ns_pivots` mit idType='cloudflare_ns_pair' geschrieben — das
//      Pair ist pro CF-Account eindeutig und damit Owner-Identifikator.
//
//   4. **MX/SPF-includes via classifyEmailDomain()**. Owner-Mailprovider-
//      Erkennung — Google-Workspace, MS365, Strato-Mail werden als
//      email_provider-Entity verlinkt (role=context), NICHT als Owner-Email
//      missinterpretiert.
//
// Apex-vs-Subdomain: SPF/DMARC/DNSSEC/CAA werden konzeptionell auf Apex-Ebene
// konfiguriert (DMARC explizit per RFC 7489 nur am organizational domain;
// DNSSEC und CAA werden über die Parent-Zone vererbt). Für Subdomains
// generieren diese Checks i.d.R. nur Noise — daher überspringen wir sie.
// "Keine A/AAAA-Records" auf Subs ist meist CT-Log-Artefakt; echte Dangling-
// Detection (Takeover-Risiko) gehört in einen dedizierten Worker.

import dns from "node:dns/promises";
import { dnsPivotService } from "../../osint/dns-pivots.service";
import { infrastructureProviderService } from "../../osint/infrastructure-providers/provider.service";
import type {
    DiscoveredEntityDraft,
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

export const dnsRecordsWorker: SecurityWorker = {
    jobKey: "dns_records",
    requiredScope: "passive_only",
    description: "DNS-Hygiene + Owner-Signal-Mining: SPF/DMARC/MX/DNSSEC/CAA + DMARC-rua-Email + TXT-Verifications-Pivot + NS-Pair-Pivot.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "asset_subdomain"
            || target.kind === "domain" || target.kind === "subdomain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const findings: FindingDraft[] = [];
        const discoveredEntities: DiscoveredEntityDraft[] = [];
        const target = ctx.target.value;
        const isApex = ctx.target.kind === "asset_domain" || ctx.target.kind === "domain";
        const targetEntityId = typeof ctx.target.id === "number" ? ctx.target.id : null;

        const raw: Record<string, unknown> = { isApex };
        const ownerEmails = new Set<string>();
        const verificationTokensPersisted: Array<{ idType: string; idValue: string }> = [];
        let nsPairPersisted: string | null = null;
        const nsProviderHits: Array<{ host: string; providerKey: string }> = [];
        const emailProviderHits: Array<{ host: string; providerKey: string; via: "mx" | "spf_include" }> = [];

        try {
            // ── A/AAAA ──────────────────────────────────────────────────────
            const a = await safe(() => dns.resolve4(target));
            const aaaa = await safe(() => dns.resolve6(target));
            raw.a = a.value ?? a.error;
            raw.aaaa = aaaa.value ?? aaaa.error;

            if (isApex && !a.value && !aaaa.value) {
                findings.push({
                    fingerprintInputs: ["dns", "no_a_or_aaaa", target],
                    severity: "info",
                    category: "dns",
                    title: "Keine A/AAAA-Records",
                    description: `Domain ${target} hat weder A- noch AAAA-Records. Möglicherweise nur als Email-Domain konfiguriert.`,
                });
            }

            // ── MX ──────────────────────────────────────────────────────────
            const mx = await safe(() => dns.resolveMx(target));
            raw.mx = mx.value ?? mx.error;
            if (isApex && mx.value && ctx.engagementId != null) {
                for (const rec of mx.value) {
                    const host = rec.exchange.toLowerCase();
                    const cls = await infrastructureProviderService.classifyAndPersistIfInfra(
                        { kind: "email_domain", value: host },
                        { engagementId: ctx.engagementId, source: `dns_records:MX=${host}` },
                    );
                    if (cls.isInfra && cls.provider) {
                        emailProviderHits.push({ host, providerKey: cls.provider.key, via: "mx" });
                    }
                }
            }

            // ── TXT (für SPF & DKIM-Discovery + Verifications-Pivot) ─────────
            const txt = await safe(() => dns.resolveTxt(target));
            raw.txt = txt.value ?? txt.error;
            const txtFlat = (txt.value ?? []).map((r) => r.join(""));

            const spf = txtFlat.find((r) => r.toLowerCase().startsWith("v=spf1"));
            if (isApex && mx.value && mx.value.length > 0) {
                if (!spf) {
                    findings.push({
                        fingerprintInputs: ["dns", "spf_missing", target],
                        severity: "high",
                        category: "email_security",
                        title: "Kein SPF-Record",
                        description: "Diese Domain empfängt Email (MX vorhanden), hat aber keinen SPF-Record. Phishing-Mails im Namen dieser Domain sind nicht abwehrbar.",
                        recommendation: "TXT-Record hinzufügen: \"v=spf1 include:<mail-provider> -all\". Bei Strato z.B. include:_spf.strato.com.",
                        evidence: { hasMx: true },
                    });
                } else if (spf.includes(" ?all") || spf.includes(" +all")) {
                    findings.push({
                        fingerprintInputs: ["dns", "spf_too_permissive", target],
                        severity: "medium",
                        category: "email_security",
                        title: "SPF zu erlaubend",
                        description: `SPF-Record endet mit "?all" oder "+all" — das macht SPF wirkungslos.`,
                        recommendation: "SPF auf \"-all\" (hard fail) oder mind. \"~all\" (soft fail) setzen.",
                        evidence: { spf },
                    });
                }
            }

            // SPF-Include-Mailprovider-Erkennung — `include:<host>` und `redirect=<host>`.
            if (isApex && spf && ctx.engagementId != null) {
                for (const include of extractSpfIncludes(spf)) {
                    const cls = await infrastructureProviderService.classifyAndPersistIfInfra(
                        { kind: "email_domain", value: include },
                        { engagementId: ctx.engagementId, source: `dns_records:SPF_include=${include}` },
                    );
                    if (cls.isInfra && cls.provider) {
                        emailProviderHits.push({ host: include, providerKey: cls.provider.key, via: "spf_include" });
                    }
                }
            }

            // TXT-Verifications-Pivot: pro TXT-Record bekannte Token-Patterns prüfen.
            if (isApex && targetEntityId != null && ctx.engagementId != null) {
                for (const t of txtFlat) {
                    const token = dnsPivotService.extractVerificationToken(t);
                    if (!token) continue;
                    try {
                        await dnsPivotService.upsertVerification({
                            engagementId: ctx.engagementId,
                            entityId: targetEntityId,
                            idType: token.idType,
                            idValue: token.idValue,
                            source: `TXT@${target}`,
                        });
                        verificationTokensPersisted.push(token);
                    } catch (err) {
                        console.warn("[dns_records] verification-pivot upsert failed", {
                            target, token, err: (err as Error).message,
                        });
                    }
                }
            }

            // ── DMARC ───────────────────────────────────────────────────────
            const dmarc = await safe(() => dns.resolveTxt(`_dmarc.${target}`));
            const dmarcFlat = (dmarc.value ?? []).map((r) => r.join(""));
            const dmarcRecord = dmarcFlat.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
            raw.dmarc = dmarcRecord ?? dmarc.error ?? null;

            if (isApex && mx.value && mx.value.length > 0 && !dmarcRecord) {
                findings.push({
                    fingerprintInputs: ["dns", "dmarc_missing", target],
                    severity: "high",
                    category: "email_security",
                    title: "Kein DMARC-Record",
                    description: "Ohne DMARC können Empfänger nicht entscheiden, was mit gefälschten Mails von dieser Domain geschehen soll.",
                    recommendation: "TXT bei _dmarc.<domain>: \"v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>\"",
                });
            } else if (isApex && dmarcRecord && /p=none/i.test(dmarcRecord)) {
                findings.push({
                    fingerprintInputs: ["dns", "dmarc_p_none", target],
                    severity: "low",
                    category: "email_security",
                    title: "DMARC nur im Monitor-Modus (p=none)",
                    description: "DMARC ist gesetzt, aber die Policy 'p=none' bedeutet: Mails werden nur überwacht, nicht abgewiesen. Schutz greift faktisch nicht.",
                    recommendation: "Nach 2-4 Wochen Monitoring auf p=quarantine, später auf p=reject hochstufen.",
                    evidence: { dmarc: dmarcRecord },
                });
            }

            // DMARC-rua/ruf-Email-Extract (Mechanik #11a). Auch auf Subdomains
            // legitim, weil DMARC-Subdomain-Policies separate _dmarc.<sub>-Records
            // haben können.
            if (dmarcRecord) {
                for (const email of extractDmarcReportEmails(dmarcRecord)) {
                    ownerEmails.add(email);
                }
            }

            // ── CAA ─────────────────────────────────────────────────────────
            const caa = await safe(() => dns.resolveCaa(target as any));
            raw.caa = (caa.value as unknown) ?? caa.error;
            if (isApex && (!caa.value || (caa.value as unknown[]).length === 0)) {
                findings.push({
                    fingerprintInputs: ["dns", "caa_missing", target],
                    severity: "info",
                    category: "dns",
                    title: "Kein CAA-Record",
                    description: "CAA-Records steuern, welche CAs Zertifikate für diese Domain ausstellen dürfen. Ohne CAA kann jede CA Certs ausstellen.",
                    recommendation: "CAA-Record für die genutzte CA setzen, z.B. \"0 issue letsencrypt.org\".",
                });
            }

            // ── DNSSEC-Hint ─────────────────────────────────────────────────
            const dnskey = await safe(() => dns.resolve(target, "DNSKEY" as any));
            raw.dnskey = dnskey.value ?? dnskey.error;
            if (isApex && (!dnskey.value || (dnskey.value as unknown[]).length === 0)) {
                findings.push({
                    fingerprintInputs: ["dns", "dnssec_missing", target],
                    severity: "info",
                    category: "dns",
                    title: "DNSSEC nicht aktiviert",
                    description: "Ohne DNSSEC können DNS-Antworten manipuliert werden. Für Hochsicherheits-Domains relevant.",
                    recommendation: "DNSSEC beim Registrar aktivieren (z.B. Cloudflare, Strato).",
                });
            }

            // ── NS ──────────────────────────────────────────────────────────
            // Sprint 2 #7 — NS-Records klassifizieren + Cloudflare-NS-Pair-Pivot.
            // Apex-only, weil Subdomain-NS i.d.R. von Apex geerbt werden.
            const ns = isApex ? await safe(() => dns.resolveNs(target)) : { value: [] as string[], error: undefined };
            raw.ns = ns.value ?? ns.error;
            if (isApex && ns.value && ns.value.length > 0 && ctx.engagementId != null) {
                for (const nsHost of ns.value) {
                    const cls = await infrastructureProviderService.classifyAndPersistIfInfra(
                        { kind: "ns_host", value: nsHost },
                        { engagementId: ctx.engagementId, source: `dns_records:NS=${nsHost}` },
                    );
                    if (cls.isInfra && cls.provider) {
                        nsProviderHits.push({ host: nsHost, providerKey: cls.provider.key });
                    }
                }
                if (targetEntityId != null) {
                    const cfPair = dnsPivotService.extractCloudflareNsPair(ns.value);
                    if (cfPair) {
                        try {
                            await dnsPivotService.upsertNsPivot({
                                engagementId: ctx.engagementId,
                                entityId: targetEntityId,
                                idType: "cloudflare_ns_pair",
                                idValue: cfPair,
                                source: `dns_records:NS@${target}`,
                            });
                            nsPairPersisted = cfPair;
                        } catch (err) {
                            console.warn("[dns_records] ns-pivot upsert failed", {
                                target, cfPair, err: (err as Error).message,
                            });
                        }
                    }
                }
            }
        } catch (err: unknown) {
            return {
                success: false,
                rawOutput: raw,
                findings,
                error: (err as Error).message,
                durationMs: Date.now() - start,
            };
        }

        // Owner-Email-Discovery aus DMARC-RUA/RUF — als email_address mit Provenance.
        for (const email of ownerEmails) {
            discoveredEntities.push({
                kind: "email_address",
                primaryValue: email,
                displayName: email,
                relationshipToRoot: {
                    kind: "owns_email",
                    direction: "from_root_to_discovered",
                    confidence: 80,
                },
                source: "recon_dmarc_rua",
                evidence: [{
                    source: "dns_records:dmarc_rua",
                    snippet: `_dmarc.${target} TXT enthält rua=mailto:${email}`,
                    confidenceContribution: 0.7,
                    evidenceClass: "organic",
                }],
            });
        }

        raw.ownerEmailsFromDmarc = [...ownerEmails];
        raw.verificationTokensPersisted = verificationTokensPersisted;
        raw.nsPairPersisted = nsPairPersisted;
        raw.nsProviderHits = nsProviderHits;
        raw.emailProviderHits = emailProviderHits;

        return {
            success: true,
            rawOutput: raw,
            findings,
            discoveredEntities,
            durationMs: Date.now() - start,
        };
    },
};

async function safe<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string }> {
    try {
        return { value: await fn() };
    } catch (err: unknown) {
        return { error: (err as NodeJS.ErrnoException).code ?? (err as Error).message };
    }
}

/**
 * Extrahiert Email-Adressen aus DMARC `rua=mailto:foo@bar.com,mailto:baz@qux.com`
 * + `ruf=...`. Bewusst tolerant: Whitespace, Mixed-Case, Mehrfach-Trennung egal.
 */
function extractDmarcReportEmails(dmarc: string): string[] {
    const out = new Set<string>();
    const matches = dmarc.matchAll(/r(?:ua|uf)\s*=\s*([^;]+)/gi);
    for (const m of matches) {
        const list = m[1];
        for (const part of list.split(",")) {
            const trimmed = part.trim();
            const emailMatch = trimmed.match(/^mailto:([^!\s,;]+@[^!\s,;]+\.[^!\s,;]{2,})/i);
            if (emailMatch) {
                const email = emailMatch[1].toLowerCase();
                if (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) out.add(email);
            }
        }
    }
    return [...out];
}

/**
 * SPF-Includes + Redirects extrahieren. `include:_spf.google.com` und
 * `redirect=spf.example.com` führen beide auf andere Mailprovider-Domains.
 */
function extractSpfIncludes(spf: string): string[] {
    const out = new Set<string>();
    const includeRe = /include:([A-Za-z0-9._-]+)/gi;
    const redirectRe = /redirect=([A-Za-z0-9._-]+)/gi;
    for (const m of spf.matchAll(includeRe)) out.add(m[1].toLowerCase());
    for (const m of spf.matchAll(redirectRe)) out.add(m[1].toLowerCase());
    return [...out];
}

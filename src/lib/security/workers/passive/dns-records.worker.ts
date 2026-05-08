// DNS-Records-Worker — passive Domain-Health-Checks.
// Prüft SPF, DKIM-Hint, DMARC, MX, DNSSEC-Hint, CAA.
// Recycelt aus node-boss/src/lib/cloudflare/domain-health.service.ts.

import dns from "node:dns/promises";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

export const dnsRecordsWorker: SecurityWorker = {
    jobKey: "dns_records",
    requiredScope: "passive_only",
    description: "DNS-Hygiene: SPF, DMARC, MX, DNSSEC, CAA — keine aktiven Anfragen am Target.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "asset_subdomain"
            || target.kind === "domain" || target.kind === "subdomain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const findings: FindingDraft[] = [];
        const target = ctx.target.value;

        const raw: Record<string, unknown> = {};

        try {
            // ── A/AAAA ──────────────────────────────────────────────────────
            const a = await safe(() => dns.resolve4(target));
            const aaaa = await safe(() => dns.resolve6(target));
            raw.a = a.value ?? a.error;
            raw.aaaa = aaaa.value ?? aaaa.error;

            if (!a.value && !aaaa.value) {
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

            // ── TXT (für SPF & DKIM-Discovery) ───────────────────────────────
            const txt = await safe(() => dns.resolveTxt(target));
            raw.txt = txt.value ?? txt.error;
            const txtFlat = (txt.value ?? []).map((r) => r.join(""));

            const spf = txtFlat.find((r) => r.toLowerCase().startsWith("v=spf1"));
            if (mx.value && mx.value.length > 0) {
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

            // ── DMARC ───────────────────────────────────────────────────────
            const dmarc = await safe(() => dns.resolveTxt(`_dmarc.${target}`));
            const dmarcFlat = (dmarc.value ?? []).map((r) => r.join(""));
            const dmarcRecord = dmarcFlat.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
            raw.dmarc = dmarcRecord ?? dmarc.error ?? null;

            if (mx.value && mx.value.length > 0 && !dmarcRecord) {
                findings.push({
                    fingerprintInputs: ["dns", "dmarc_missing", target],
                    severity: "high",
                    category: "email_security",
                    title: "Kein DMARC-Record",
                    description: "Ohne DMARC können Empfänger nicht entscheiden, was mit gefälschten Mails von dieser Domain geschehen soll.",
                    recommendation: "TXT bei _dmarc.<domain>: \"v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>\"",
                });
            } else if (dmarcRecord && /p=none/i.test(dmarcRecord)) {
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

            // ── CAA ─────────────────────────────────────────────────────────
            const caa = await safe(() => dns.resolveCaa(target as any));
            raw.caa = (caa.value as unknown) ?? caa.error;
            if (!caa.value || (caa.value as unknown[]).length === 0) {
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
            if (!dnskey.value || (dnskey.value as unknown[]).length === 0) {
                findings.push({
                    fingerprintInputs: ["dns", "dnssec_missing", target],
                    severity: "info",
                    category: "dns",
                    title: "DNSSEC nicht aktiviert",
                    description: "Ohne DNSSEC können DNS-Antworten manipuliert werden. Für Hochsicherheits-Domains relevant.",
                    recommendation: "DNSSEC beim Registrar aktivieren (z.B. Cloudflare, Strato).",
                });
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

        return {
            success: true,
            rawOutput: raw,
            findings,
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

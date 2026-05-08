// Phase 2.7 — email_dns_signals Worker.
//
// Input:  email_address-Entity (target.value = canonical_key = lowercased email)
// Output: Findings (kategorie=email_security/dns) zur Email-Domain.
//
// Prüft die Mailbarkeit der Email-Domain: MX, null-MX (RFC 7505), SPF, DMARC,
// DKIM-Hint via gängigster Selektor-Liste. Reine DNS-Lookups, kein Traffic an
// den Mailserver — bleibt strikt passive_only.

import dns from "node:dns/promises";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";
import { acquireProvider } from "../../osint/provider-limiter";

// Verbreitete DKIM-Selektoren — wir probieren diese Liste passiv ab. Bei Fund
// emittieren wir den Selektor-Namen, kein Public-Key-Inhalt (vermeidet noise).
const COMMON_DKIM_SELECTORS = [
    "default", "google", "selector1", "selector2", "k1", "k2",
    "mxvault", "mandrill", "mailjet", "sendgrid", "scph0316",
    "strato-dkim-0001", "strato-dkim-0002", "strato-dkim-0003",
    "fm1", "fm2", "fm3",
];

export const emailDnsSignalsWorker: SecurityWorker = {
    jobKey: "email_dns_signals",
    requiredScope: "passive_only",
    description: "Email-Domain DNS-Signale: MX, SPF, DMARC, DKIM-Selektor-Probing — keine SMTP-Connects.",
    defaultTimeoutMs: 30_000,

    isApplicable(target) {
        return target.kind === "email_address";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const findings: FindingDraft[] = [];
        const email = ctx.target.value;
        const atIdx = email.lastIndexOf("@");
        if (atIdx < 0) {
            return {
                success: false,
                findings: [],
                error: `invalid_email: ${email}`,
                durationMs: Date.now() - start,
            };
        }
        const domain = email.slice(atIdx + 1);
        const raw: Record<string, unknown> = { domain };

        const release = await acquireProvider("dns");
        try {
            // ── MX ──────────────────────────────────────────────────────────
            const mx = await safe(() => dns.resolveMx(domain));
            raw.mx = mx.value ?? mx.error;

            const mxList = mx.value ?? [];
            const isNullMx = mxList.length === 1 && mxList[0]!.exchange === "" && mxList[0]!.priority === 0;

            if (isNullMx) {
                findings.push({
                    fingerprintInputs: ["email_dns", "null_mx", domain],
                    severity: "info",
                    category: "email_security",
                    title: `Domain ${domain} akzeptiert keine Email (RFC 7505 Null-MX)`,
                    description: `Die Email-Domain ${domain} hat einen "."-MX-Record (Null-MX). Mails an ${email} werden nicht zugestellt.`,
                    evidence: { domain, mx: mxList },
                });
            } else if (mxList.length === 0) {
                // Kein MX und ggf. kein A → wahrscheinlich tippfehler oder wegfall.
                const a = await safe(() => dns.resolve4(domain));
                raw.a = a.value ?? a.error;
                if (!a.value || a.value.length === 0) {
                    findings.push({
                        fingerprintInputs: ["email_dns", "domain_unresolvable", domain],
                        severity: "low",
                        category: "email_security",
                        title: `Email-Domain ${domain} nicht auflösbar`,
                        description: `${domain} hat weder MX- noch A-Record. Mögliches Typo-Squatting oder defunct.`,
                        evidence: { domain },
                    });
                } else {
                    // Kein MX, aber A → fallback auf A für Mail (RFC veraltet, manche Provider tun's noch).
                    findings.push({
                        fingerprintInputs: ["email_dns", "no_mx_a_fallback", domain],
                        severity: "info",
                        category: "email_security",
                        title: `Email-Domain ${domain} ohne MX (A-Fallback)`,
                        description: "Kein MX-Record gesetzt — Mail-Delivery hängt am A-Record-Fallback (veraltet).",
                        evidence: { domain, a: a.value },
                    });
                }
            }

            // ── SPF ─────────────────────────────────────────────────────────
            const txt = await safe(() => dns.resolveTxt(domain));
            const txtFlat = (txt.value ?? []).map((r) => r.join(""));
            const spf = txtFlat.find((r) => r.toLowerCase().startsWith("v=spf1"));
            raw.spf = spf ?? null;

            if (mxList.length > 0 && !isNullMx) {
                if (!spf) {
                    findings.push({
                        fingerprintInputs: ["email_dns", "spf_missing", domain],
                        severity: "high",
                        category: "email_security",
                        title: `Kein SPF-Record auf Email-Domain ${domain}`,
                        description: "Diese Domain empfängt Email (MX vorhanden), hat aber keinen SPF-Record. Phishing-Mails im Namen dieser Domain sind nicht abwehrbar.",
                        recommendation: "TXT-Record hinzufügen: \"v=spf1 include:<mail-provider> -all\".",
                        evidence: { domain },
                    });
                } else if (/\s\+all\b/.test(spf) || /\s\?all\b/.test(spf)) {
                    findings.push({
                        fingerprintInputs: ["email_dns", "spf_too_permissive", domain],
                        severity: "medium",
                        category: "email_security",
                        title: `SPF auf ${domain} zu erlaubend`,
                        description: `SPF endet mit "+all" oder "?all" — der Schutz ist faktisch wirkungslos.`,
                        recommendation: "SPF auf \"-all\" (hard fail) oder mind. \"~all\" setzen.",
                        evidence: { spf },
                    });
                }
            }

            // ── DMARC ───────────────────────────────────────────────────────
            const dmarc = await safe(() => dns.resolveTxt(`_dmarc.${domain}`));
            const dmarcFlat = (dmarc.value ?? []).map((r) => r.join(""));
            const dmarcRecord = dmarcFlat.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
            raw.dmarc = dmarcRecord ?? null;

            if (mxList.length > 0 && !isNullMx && !dmarcRecord) {
                findings.push({
                    fingerprintInputs: ["email_dns", "dmarc_missing", domain],
                    severity: "high",
                    category: "email_security",
                    title: `Kein DMARC-Record auf ${domain}`,
                    description: "Ohne DMARC-Policy bleibt SPF allein — Spoofing-Schutz unvollständig.",
                    recommendation: "TXT bei _dmarc.<domain>: \"v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>\"",
                });
            }

            // ── DKIM-Selektor-Probing ───────────────────────────────────────
            const foundSelectors: string[] = [];
            for (const sel of COMMON_DKIM_SELECTORS) {
                if (ctx.abortSignal?.aborted) break;
                const r = await safe(() => dns.resolveTxt(`${sel}._domainkey.${domain}`));
                if (r.value && r.value.length > 0) {
                    foundSelectors.push(sel);
                }
            }
            raw.dkimSelectorsFound = foundSelectors;
            if (mxList.length > 0 && !isNullMx && foundSelectors.length === 0) {
                findings.push({
                    fingerprintInputs: ["email_dns", "dkim_no_selector", domain],
                    severity: "medium",
                    category: "email_security",
                    title: `Keine bekannten DKIM-Selektoren auf ${domain}`,
                    description: `Probing mit ${COMMON_DKIM_SELECTORS.length} gängigen Selektoren ergab keinen Treffer. DKIM ist möglicherweise nicht eingerichtet (oder nutzt ungewöhnlichen Selektor).`,
                    recommendation: "DKIM beim Mail-Provider aktivieren und Public-Key-CNAME im DNS hinterlegen.",
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
        } finally {
            release();
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

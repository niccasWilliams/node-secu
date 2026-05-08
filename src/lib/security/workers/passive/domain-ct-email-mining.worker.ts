// Phase 2.7 — domain_ct_email_mining Worker.
//
// Input:  asset_domain-Entity
// Output: Pro Email-Adresse aus RFC822-SANs ein discoveredEntity (kind=email_address)
//         + Relationship "email_of_domain" zur Wurzel-Domain.
//
// Quelle: crt.sh JSON-Endpoint. Wir filtern danach, ob das `name_value`-Feld
// Email-Adressen enthält (RFC822-SANs landen mit anderen SANs gemischt im
// name_value mit Newline-Separator). Pragmatischer Ansatz statt dediziertem
// Endpoint, weil crt.sh nicht offiziell für rfc822-only-Filter exponiert ist.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    DiscoveredEntityDraft,
    FindingDraft,
} from "../worker.types";
import { acquireProvider, markProvider429, markProviderSuccess } from "../../osint/provider-limiter";
import { osintHttp } from "../../osint/osint-http";

interface CrtShRecord {
    name_value?: string;
    common_name?: string;
    issuer_name?: string;
    not_before?: string;
    not_after?: string;
}

const EMAIL_REGEX = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

function extractEmails(record: CrtShRecord): string[] {
    const out = new Set<string>();
    const sources = [record.name_value ?? "", record.common_name ?? ""];
    for (const src of sources) {
        const matches = src.match(EMAIL_REGEX);
        if (!matches) continue;
        for (const m of matches) out.add(m.toLowerCase());
    }
    return [...out];
}

function emailDomain(email: string): string {
    const at = email.lastIndexOf("@");
    return at < 0 ? "" : email.slice(at + 1);
}

export const domainCtEmailMiningWorker: SecurityWorker = {
    jobKey: "domain_ct_email_mining",
    requiredScope: "passive_only",
    description: "Sucht in CT-Logs (crt.sh) nach Emails, die als RFC822-SAN in Zertifikaten der Ziel-Domain auftauchen.",
    defaultTimeoutMs: 60_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "asset_subdomain";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const domain = ctx.target.value.trim().toLowerCase();
        const providerKey = "crt.sh-rfc822";
        const release = await acquireProvider(providerKey, { abortSignal: ctx.abortSignal });
        try {
            // %25 = wildcard so we get certs for the domain itself + any sub-records
            // that may carry RFC822-SANs (admin@... typischerweise im selben Zert wie *.domain.tld).
            const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;

            // crt.sh ist auf großen TLDs/Domains regelmäßig 40-60s slow. Wir geben 90s
            // pro Versuch und retry'n einmal auf reine Timeout-Codes (ECONNABORTED/
            // ETIMEDOUT). 429/503 werden weiter unten via markProvider429 gehandhabt.
            const PER_ATTEMPT_TIMEOUT_MS = 90_000;
            let res: { status: number; data: unknown } | null = null;
            let timeoutErr: unknown = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    res = await osintHttp.client().get<CrtShRecord[]>(url, {
                        timeout: PER_ATTEMPT_TIMEOUT_MS,
                        signal: ctx.abortSignal,
                        validateStatus: () => true,
                    });
                    timeoutErr = null;
                    break;
                } catch (err: unknown) {
                    const e = err as { code?: string; response?: { status?: number } };
                    const isPureTimeout =
                        (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") && !e.response;
                    if (attempt === 1 && isPureTimeout && !ctx.abortSignal?.aborted) {
                        timeoutErr = err;
                        continue;
                    }
                    throw err;
                }
            }
            if (!res) {
                throw timeoutErr ?? new Error("ct_sh_request_failed");
            }

            if (res.status === 429 || res.status === 503) {
                await markProvider429(providerKey, `crt.sh ${res.status}`);
                return {
                    success: true,
                    findings: [],
                    error: `provider_paused:${providerKey}`,
                    durationMs: Date.now() - start,
                };
            }
            if (res.status !== 200 || !Array.isArray(res.data)) {
                return {
                    success: false,
                    findings: [],
                    error: `crt_sh_unexpected:${res.status}`,
                    durationMs: Date.now() - start,
                };
            }

            markProviderSuccess(providerKey);
            const records = res.data;
            const emails = new Map<string, { firstSeen: string | null; certCount: number }>();
            const allEmails = new Set<string>();

            for (const rec of records) {
                const found = extractEmails(rec);
                for (const e of found) {
                    allEmails.add(e);
                    if (!emailDomain(e).endsWith(domain)) continue; // nur Emails der Ziel-Domain
                    const cur = emails.get(e) ?? { firstSeen: rec.not_before ?? null, certCount: 0 };
                    cur.certCount += 1;
                    if (rec.not_before && (!cur.firstSeen || rec.not_before < cur.firstSeen)) {
                        cur.firstSeen = rec.not_before;
                    }
                    emails.set(e, cur);
                }
            }

            const discovered: DiscoveredEntityDraft[] = [];
            for (const [email, info] of emails) {
                const [local, dom] = email.split("@");
                discovered.push({
                    kind: "email_address",
                    primaryValue: email,
                    displayName: email,
                    data: {
                        local,
                        domain: dom,
                        firstSeenInCert: info.firstSeen,
                        certCount: info.certCount,
                        discoveredVia: "ct_log_rfc822_san",
                    },
                    relationshipToRoot: {
                        kind: "email_of_domain",
                        direction: "from_root_to_discovered",
                        confidence: 90,
                    },
                    source: "osint_crt_sh_rfc822",
                });
            }

            const findings: FindingDraft[] = [];
            if (emails.size > 0) {
                findings.push({
                    fingerprintInputs: ["osint_ct_email_mining", domain, [...emails.keys()].sort().join(",")],
                    severity: "info",
                    category: "exposure",
                    title: `${emails.size} Emails der Domain ${domain} in CT-Logs`,
                    description: `Aus den Certificate-Transparency-Logs zur Domain ${domain} wurden ${emails.size} Email-Adresse(n) als RFC822-SAN extrahiert: ${[...emails.keys()].slice(0, 20).join(", ")}${emails.size > 20 ? ` (+${emails.size - 20})` : ""}.`,
                    evidence: { emails: [...emails.keys()], totalCertsScanned: records.length },
                });
            }

            return {
                success: true,
                rawOutput: { domain, totalCerts: records.length, emailsFound: emails.size, foreignEmailsSeen: allEmails.size - emails.size },
                findings,
                discoveredEntities: discovered,
                durationMs: Date.now() - start,
            };
        } catch (err: unknown) {
            const e = err as { response?: { status?: number }; message?: string };
            if (e.response?.status === 429 || e.response?.status === 503) {
                await markProvider429(providerKey, e.message);
                return {
                    success: true,
                    findings: [],
                    error: `provider_paused:${providerKey}`,
                    durationMs: Date.now() - start,
                };
            }
            return {
                success: false,
                findings: [],
                error: e.message ?? "ct_email_mining_failed",
                durationMs: Date.now() - start,
            };
        } finally {
            release();
        }
    },
};

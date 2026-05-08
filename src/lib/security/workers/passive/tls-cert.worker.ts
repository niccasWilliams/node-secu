// TLS-Cert-Worker — passive TLS-Inspektion + SAN-Subdomain-Discovery.
//
// Phase 2 (Initial): Cert-Validity, Restlaufzeit, Protokoll-Version Findings.
// Verbindet einmalig zum Target auf 443 — "passive" weil ein einzelner Connect
// kein Scan-Pattern ist.
//
// Sprint 2 #12 (OSINT-Engine, features.md R5/L6 + §2.8) — refactored um:
//
//   1. **Subject-Validity-Gate**: Bei abgelaufenem oder noch-nicht-gültigem
//      Cert werden SAN-Hostnames NICHT als faktische Subdomain-Discovery
//      angelegt — sondern als `speculative=true` (Cert ist untrustworthy →
//      Owner-Behauptung der SANs ist es auch). Vermeidet, dass z.B. ein
//      angreifer-kontrolliertes self-signed Cert mit gefälschten SANs den
//      Engagement-Graph vergiftet.
//
//   2. **SAN-Discovery**: DNS-Names aus dem Cert (subjectAltName) werden als
//      `asset_subdomain`-Discoveries gemeldet — wenn sie unter der Root-Domain
//      des Targets liegen. Wildcards (*) werden ausgewertet, das Wildcard-
//      Token entfernt. Provenance: `evidenceClass=organic`,
//      `confidenceContribution=0.6` (gültiges Cert mit SAN-Match ist solides
//      Owner-Signal, aber nicht ganz so stark wie Live-DNS-Resolve).
//
//   3. **Provider-Filter**: SANs auf bekannten Platform-Default-Domains
//      (`*.up.railway.app`, `*.vercel.app`) werden NICHT als Cross-Domain-
//      Pivot/Subdomain-Discovery gewertet — nur als infrastructure_provider-
//      Context-Entity verlinkt (siehe features.md §2.8 #3).

import tls from "node:tls";
import { infrastructureProviderService } from "../../osint/infrastructure-providers/provider.service";
import type {
    DiscoveredEntityDraft,
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

export const tlsCertWorker: SecurityWorker = {
    jobKey: "tls_cert",
    requiredScope: "passive_only",
    description: "TLS-Zertifikat: Validität, Restlaufzeit, SAN-Discovery (mit Validity-Gate), Protokoll-Version.",
    defaultTimeoutMs: 15_000,

    isApplicable(target) {
        return target.kind === "asset_domain" || target.kind === "asset_subdomain"
            || target.kind === "asset_url" || target.kind === "domain"
            || target.kind === "subdomain" || target.kind === "url";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const findings: FindingDraft[] = [];
        const discovered: DiscoveredEntityDraft[] = [];
        const host = hostFromTargetValue(ctx.target.value);
        const rootDomain = rootDomainOf(host);

        try {
            const cert = await fetchCert(host, 443, ctx.timeoutMs);
            const raw: Record<string, unknown> = {
                subject: cert.subject,
                issuer: cert.issuer,
                valid_from: cert.valid_from,
                valid_to: cert.valid_to,
                subjectaltname: cert.subjectaltname,
                fingerprint256: cert.fingerprint256,
                protocol: cert.protocol,
            };

            // Validity-Status berechnen.
            const now = Date.now();
            const validFrom = new Date(cert.valid_from);
            const validTo = new Date(cert.valid_to);
            const notYetValid = validFrom.getTime() > now;
            const expired = validTo.getTime() < now;
            const isInvalid = notYetValid || expired;
            const daysLeft = Math.floor((validTo.getTime() - now) / 86_400_000);

            if (expired) {
                findings.push({
                    fingerprintInputs: ["cert", "expired", host],
                    severity: "critical",
                    category: "cert",
                    title: "TLS-Zertifikat abgelaufen",
                    description: `Das Zertifikat ist seit ${Math.abs(daysLeft)} Tagen abgelaufen.`,
                    recommendation: "Sofort neu ausstellen (Let's Encrypt automatisiert via certbot/Caddy).",
                    evidence: { valid_to: cert.valid_to },
                });
            } else if (notYetValid) {
                findings.push({
                    fingerprintInputs: ["cert", "not_yet_valid", host],
                    severity: "high",
                    category: "cert",
                    title: "TLS-Zertifikat noch nicht gültig",
                    description: `Das Zertifikat ist erst ab ${cert.valid_from} gültig (Future-Datum). Möglicher Clock-Skew oder fehlerhafter Issuer.`,
                    recommendation: "Server-Zeit prüfen und/oder Cert neu ausstellen.",
                    evidence: { valid_from: cert.valid_from },
                });
            } else if (daysLeft < 14) {
                findings.push({
                    fingerprintInputs: ["cert", "expiring_soon", host],
                    severity: "high",
                    category: "cert",
                    title: "TLS-Zertifikat läuft bald ab",
                    description: `Nur noch ${daysLeft} Tage Restlaufzeit.`,
                    recommendation: "Renewal-Job prüfen — Auto-Renewal sollte spätestens 30 Tage vor Ablauf laufen.",
                    evidence: { daysLeft },
                });
            } else if (daysLeft < 30) {
                findings.push({
                    fingerprintInputs: ["cert", "renewal_window", host],
                    severity: "info",
                    category: "cert",
                    title: "TLS-Zertifikat im Renewal-Fenster",
                    description: `${daysLeft} Tage Restlaufzeit — Auto-Renewal sollte demnächst greifen.`,
                });
            }

            // Protokoll-Version
            if (cert.protocol && /TLSv1\.0|TLSv1\.1|SSLv/i.test(cert.protocol)) {
                findings.push({
                    fingerprintInputs: ["tls", "old_protocol", host, cert.protocol],
                    severity: "high",
                    category: "tls",
                    title: `Veraltetes TLS-Protokoll: ${cert.protocol}`,
                    description: "TLS 1.0 und 1.1 sind seit 2020 deprecated und werden von modernen Browsern abgelehnt.",
                    recommendation: "Server-Config auf min. TLS 1.2, idealerweise TLS 1.3 setzen.",
                });
            }

            // SAN-Subdomain-Discovery — nur wenn Root-Domain bekannt UND
            // SAN unterhalb der Root-Domain liegt. Wildcards werden zum Apex-
            // Token reduziert, aber NICHT als eigene Subdomain — `*.example.com`
            // als SAN ist kein Beleg für eine konkrete `foo.example.com`.
            const sanList = parseSubjectAltNames(cert.subjectaltname);
            raw.sanList = sanList;
            const sanProviderHits: Array<{ san: string; providerKey: string }> = [];

            for (const san of sanList) {
                if (!san.startsWith("DNS:")) continue;
                const dnsName = san.slice(4).trim().toLowerCase();
                if (!dnsName) continue;
                if (dnsName.startsWith("*.")) continue; // Wildcards skippen — keine konkrete Discovery.

                // Provider-Filter: *.up.railway.app, *.vercel.app etc. → context, kein Pivot.
                if (ctx.engagementId != null) {
                    const cls = await infrastructureProviderService.classifyAndPersistIfInfra(
                        { kind: "domain", value: dnsName },
                        { engagementId: ctx.engagementId, source: `tls_cert:SAN=${dnsName}` },
                    );
                    if (cls.isInfra && cls.provider) {
                        sanProviderHits.push({ san: dnsName, providerKey: cls.provider.key });
                        continue;
                    }
                }

                // Nur Subdomains der Root-Domain als asset_subdomain zählen.
                // Cross-Domain-SANs (Cert für mehrere Domains gleichzeitig) gehen
                // separat als `asset_domain` mit `linked_to`-Beziehung, weil sie
                // ein starkes Owner-Signal sind (Cross-Domain-Cert-Sharing).
                let kind: "asset_subdomain" | "asset_domain";
                if (rootDomain && (dnsName === rootDomain || dnsName.endsWith(`.${rootDomain}`))) {
                    if (dnsName === rootDomain) continue; // entspricht der Root-Entity selbst.
                    kind = "asset_subdomain";
                } else {
                    kind = "asset_domain";
                }

                discovered.push({
                    kind,
                    primaryValue: dnsName,
                    displayName: dnsName,
                    data: {
                        discoveredVia: "tls_cert_san",
                        sourceHost: host,
                        certInvalid: isInvalid,
                    },
                    relationshipToRoot: kind === "asset_subdomain"
                        ? { kind: "subdomain_of", direction: "from_discovered_to_root", confidence: isInvalid ? 30 : 80 }
                        : { kind: "linked_to", direction: "from_root_to_discovered", confidence: isInvalid ? 30 : 70 },
                    source: "recon_tls_san",
                    speculativeOverride: isInvalid ? true : (kind === "asset_domain" ? true : undefined),
                    evidence: [{
                        source: "tls_cert:SAN",
                        snippet: `TLS-Cert (${host}) führt SAN ${dnsName}${isInvalid ? " — Cert INVALID" : ""}`,
                        confidenceContribution: isInvalid ? 0.2 : (kind === "asset_subdomain" ? 0.6 : 0.5),
                        evidenceClass: "organic",
                    }],
                });
            }

            raw.sanProviderHits = sanProviderHits;
            raw.daysLeft = daysLeft;
            raw.notYetValid = notYetValid;
            raw.expired = expired;

            return {
                success: true,
                rawOutput: raw,
                findings,
                discoveredEntities: discovered,
                durationMs: Date.now() - start,
            };
        } catch (err: unknown) {
            return {
                success: false,
                findings,
                error: (err as Error).message,
                durationMs: Date.now() - start,
            };
        }
    },
};

function hostFromTargetValue(value: string): string {
    if (value.startsWith("http")) {
        try {
            return new URL(value).hostname;
        } catch {
            return value;
        }
    }
    return value;
}

/** Best-effort root-domain detection — strips one or two leading subdomain labels. */
function rootDomainOf(host: string): string | null {
    if (!host) return null;
    const parts = host.split(".");
    if (parts.length < 2) return null;
    if (parts.length === 2) return host;
    // Heuristik: Bei .co.uk / .com.au / .co.jp etc. zwei Labels als Suffix.
    // Konservativ: für Standard-TLDs (.com, .de, .net) liefert `last 2` korrektes Ergebnis;
    // für Subdomains des Targets (api.example.com) auch. Mehr-Labels-Public-Suffixes
    // (z.B. blog.example.co.uk) bekommen ungenaues Ergebnis — Sprint 5 kann
    // public-suffix-list nutzen.
    return parts.slice(-2).join(".");
}

function parseSubjectAltNames(san?: string): string[] {
    if (!san) return [];
    return san.split(",").map((s) => s.trim()).filter(Boolean);
}

function fetchCert(
    host: string,
    port: number,
    timeoutMs: number,
): Promise<tls.PeerCertificate & { protocol?: string }> {
    return new Promise((resolve, reject) => {
        const socket = tls.connect(
            { host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs },
            () => {
                const cert = socket.getPeerCertificate(true);
                const protocol = socket.getProtocol() ?? undefined;
                socket.end();
                if (!cert || Object.keys(cert).length === 0) {
                    reject(new Error("no_cert_returned"));
                    return;
                }
                resolve({ ...cert, protocol });
            },
        );
        socket.on("error", reject);
        socket.on("timeout", () => {
            socket.destroy();
            reject(new Error("tls_connect_timeout"));
        });
    });
}

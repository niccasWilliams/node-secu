// TLS-Cert-Worker — passive TLS-Inspektion.
// Verbindet einmalig zum Target auf 443, liest Cert-Chain, prüft Validity, Cipher, HSTS.
// "Passive" weil ein einzelner Connect kein Scan-Pattern ist (= legal ohne Authorization).

import tls from "node:tls";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";

export const tlsCertWorker: SecurityWorker = {
    jobKey: "tls_cert",
    requiredScope: "passive_only",
    description: "TLS-Zertifikat: Validität, Restlaufzeit, SAN-Match, Protokoll-Version.",
    defaultTimeoutMs: 15_000,

    isApplicable(asset) {
        return asset.kind === "domain" || asset.kind === "subdomain" || asset.kind === "url";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const findings: FindingDraft[] = [];
        const host = hostFromAsset(ctx.asset.value);

        try {
            const cert = await fetchCert(host, 443, ctx.timeoutMs);
            const raw = {
                subject: cert.subject,
                issuer: cert.issuer,
                valid_from: cert.valid_from,
                valid_to: cert.valid_to,
                subjectaltname: cert.subjectaltname,
                fingerprint256: cert.fingerprint256,
                protocol: cert.protocol,
            };

            // Restlaufzeit
            const validTo = new Date(cert.valid_to);
            const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);

            if (daysLeft < 0) {
                findings.push({
                    fingerprintInputs: ["cert", "expired", host],
                    severity: "critical",
                    category: "cert",
                    title: "TLS-Zertifikat abgelaufen",
                    description: `Das Zertifikat ist seit ${Math.abs(daysLeft)} Tagen abgelaufen.`,
                    recommendation: "Sofort neu ausstellen (Let's Encrypt automatisiert via certbot/Caddy).",
                    evidence: { valid_to: cert.valid_to },
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

            return {
                success: true,
                rawOutput: raw,
                findings,
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

function hostFromAsset(value: string): string {
    if (value.startsWith("http")) {
        try {
            return new URL(value).hostname;
        } catch {
            return value;
        }
    }
    return value;
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

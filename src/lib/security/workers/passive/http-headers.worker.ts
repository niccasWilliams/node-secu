// HTTP-Headers-Worker — ein einziger HEAD/GET-Request, prüft Security-Header.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
    TechDraft,
} from "../worker.types";

export const httpHeadersWorker: SecurityWorker = {
    jobKey: "http_headers",
    requiredScope: "passive_only",
    description: "Security-Header: CSP, HSTS, X-Frame-Options, Permissions-Policy. Tech-Detection via Server-Header.",
    defaultTimeoutMs: 15_000,

    isApplicable(asset) {
        return asset.kind === "domain" || asset.kind === "subdomain" || asset.kind === "url";
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const findings: FindingDraft[] = [];
        const tech: TechDraft[] = [];
        const url = toHttpsUrl(ctx.asset.value);

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
            const res = await fetch(url, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
                headers: { "User-Agent": "node-secu/0.1 (+passive-scan)" },
            }).finally(() => clearTimeout(timer));

            const headers: Record<string, string> = {};
            res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

            // Security-Header-Checks
            if (!headers["strict-transport-security"]) {
                findings.push({
                    fingerprintInputs: ["headers", "hsts_missing", url],
                    severity: "medium",
                    category: "http_headers",
                    title: "Strict-Transport-Security (HSTS) fehlt",
                    description: "Ohne HSTS kann ein Angreifer (MITM) HTTPS auf HTTP downgraden.",
                    recommendation: "Header setzen: \"Strict-Transport-Security: max-age=63072000; includeSubDomains; preload\".",
                });
            }

            if (!headers["content-security-policy"]) {
                findings.push({
                    fingerprintInputs: ["headers", "csp_missing", url],
                    severity: "medium",
                    category: "http_headers",
                    title: "Content-Security-Policy fehlt",
                    description: "CSP ist die wichtigste Verteidigung gegen XSS. Komplett fehlend = Schutz auf Browser-Default.",
                    recommendation: "Restriktive CSP einführen, z.B. \"default-src 'self'; script-src 'self'\".",
                });
            }

            if (!headers["x-frame-options"] && !headers["content-security-policy"]?.includes("frame-ancestors")) {
                findings.push({
                    fingerprintInputs: ["headers", "clickjacking", url],
                    severity: "medium",
                    category: "http_headers",
                    title: "Clickjacking-Schutz fehlt",
                    description: "Weder X-Frame-Options noch CSP frame-ancestors gesetzt — Seite kann in einem iframe missbraucht werden.",
                    recommendation: "Header: \"X-Frame-Options: DENY\" oder CSP \"frame-ancestors 'none'\".",
                });
            }

            if (!headers["referrer-policy"]) {
                findings.push({
                    fingerprintInputs: ["headers", "referrer_policy_missing", url],
                    severity: "low",
                    category: "http_headers",
                    title: "Referrer-Policy fehlt",
                    description: "Browser sendet bei externen Links volle URL als Referrer — potenzielles Privacy-Leak.",
                    recommendation: "\"Referrer-Policy: strict-origin-when-cross-origin\" empfohlen.",
                });
            }

            if (!headers["permissions-policy"] && !headers["feature-policy"]) {
                findings.push({
                    fingerprintInputs: ["headers", "permissions_policy_missing", url],
                    severity: "info",
                    category: "http_headers",
                    title: "Permissions-Policy fehlt",
                    description: "Steuert, welche Browser-APIs (Camera, Mic, Geolocation) Sub-Frames nutzen dürfen.",
                });
            }

            // Cookies
            const setCookie = res.headers.get("set-cookie");
            if (setCookie) {
                if (!/secure/i.test(setCookie)) {
                    findings.push({
                        fingerprintInputs: ["headers", "cookie_no_secure", url],
                        severity: "high",
                        category: "http_headers",
                        title: "Cookie ohne Secure-Flag",
                        description: "Set-Cookie-Header ohne 'Secure' — Cookie könnte über unverschlüsseltes HTTP übertragen werden.",
                    });
                }
                if (!/httponly/i.test(setCookie)) {
                    findings.push({
                        fingerprintInputs: ["headers", "cookie_no_httponly", url],
                        severity: "medium",
                        category: "http_headers",
                        title: "Cookie ohne HttpOnly-Flag",
                        description: "Cookie kann via JavaScript ausgelesen werden — XSS-Angreifer kann Session stehlen.",
                    });
                }
                if (!/samesite/i.test(setCookie)) {
                    findings.push({
                        fingerprintInputs: ["headers", "cookie_no_samesite", url],
                        severity: "low",
                        category: "http_headers",
                        title: "Cookie ohne SameSite-Attribut",
                        description: "Browser-Defaults (Lax) greifen, aber explizit setzen ist Best Practice gegen CSRF.",
                    });
                }
            }

            // Tech-Detection (rudimentär — Phase 2 erweitert via Wappalyzer-Library)
            const server = headers["server"];
            if (server) {
                tech.push(parseServerHeader(server));
            }
            const xpb = headers["x-powered-by"];
            if (xpb) {
                tech.push(parsePoweredByHeader(xpb));
                findings.push({
                    fingerprintInputs: ["headers", "x_powered_by_disclosure", url],
                    severity: "info",
                    category: "config",
                    title: "X-Powered-By offenbart Tech-Stack",
                    description: `Server gibt explizit \"${xpb}\" als X-Powered-By-Header zurück — verrät Versionsinfo, hilft Angreifern bei CVE-Targeting.`,
                    recommendation: "Header in der Server-Config (Nginx/Express) entfernen.",
                });
            }

            return {
                success: true,
                rawOutput: { status: res.status, headers },
                findings,
                techFingerprints: tech,
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

function toHttpsUrl(value: string): string {
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return `https://${value}`;
}

function parseServerHeader(server: string): TechDraft {
    const match = server.match(/^([^/\s]+)(?:\/(\S+))?/);
    return {
        techName: match?.[1] ?? server,
        version: match?.[2],
        detectionSource: "header",
        confidence: match?.[2] ? "high" : "medium",
        evidence: { header: "server", value: server },
    };
}

function parsePoweredByHeader(value: string): TechDraft {
    const match = value.match(/^([^/\s]+)(?:\/(\S+))?/);
    return {
        techName: match?.[1] ?? value,
        version: match?.[2],
        detectionSource: "header",
        confidence: match?.[2] ? "high" : "medium",
        evidence: { header: "x-powered-by", value },
    };
}

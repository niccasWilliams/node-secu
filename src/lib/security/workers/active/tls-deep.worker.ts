// TLS Deep-Audit Worker — Wrapper um testssl.sh.
//
// Scope: active_safe.
// Begründung: testssl macht nur SSL/TLS-Handshakes auf Port 443 (Public-Service-
// Probing der Cipher-Suites/Protokolle). Keine Auth-Brute, keine SQL-Injection,
// kein Path-Brute — entspricht "active_safe" in unserem Authorization-Modell.
//
// Output: testssl --jsonfile-pretty schreibt strukturiertes JSON. Wir parsen das
// und mappen severity (CRITICAL/HIGH/MEDIUM/LOW/INFO/WARN) auf unsere FindingDraft.

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";
import { spawnTool } from "../_lib/spawn-tool";
import { resolveHost } from "../_lib/resolve-host";

interface TestsslFinding {
    id?: string;
    ip?: string;
    port?: string;
    severity?: string;
    cve?: string;
    cwe?: string;
    finding?: string;
}

const SEV_MAP: Record<string, FindingDraft["severity"]> = {
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
    WARN: "low",
    INFO: "info",
    OK: "info",
    DEBUG: "info",
};

// IDs, die wir explizit unterdrücken (zu rauschig oder rein informativ und
// werden bereits durch tls_cert / dns_records abgedeckt).
//
// testssl hängt an manche IDs einen Suffix wie "<hostCert#1>" oder "<rsa>"
// → wir matchen gegen die Base-ID (alles vor dem ersten Whitespace). RC4 ist
// hier kein Target-Befund, sondern ein lokales Tool-Limit ("not supported by
// local OpenSSL").
const SUPPRESS_IDS = new Set<string>([
    "scanProblem",
    "engine_problem",
    "service",
    "pre_128cipher",
    "cipher_order",
    "cipher_order-tls1_2",
    "cipher_order-tls1_3",
    "cipherorder_tls1_2",
    "cipherorder_tls1_3",
    "cipher_negotiated",
    "cert_extlifeSpan",
    "cert_validityPeriod",
    "cert_chain_of_trust",
    "cert_signatureAlgorithm",
    "cert_keySize",
    "DNS_CAArecord",     // doppelt zu dns_records-Worker
    "OCSP_stapling",
    "certificate_transparency",
    "HSTS",
    "HSTS_time",
    "HSTS_subdomains",
    "HSTS_preload",
    "RC4",               // lokales OpenSSL-Tool-Limit, kein Target-Befund
    "cipherlist_3DES_IDEA",
    "cipherlist_OBSOLETED",
]);

function baseId(id: string): string {
    const idx = id.indexOf(" ");
    return idx === -1 ? id : id.slice(0, idx);
}

export const tlsDeepWorker: SecurityWorker = {
    jobKey: "sslyze_deep",
    requiredScope: "active_safe",
    description:
        "Deep TLS Audit: Cipher-Suites, Protokoll-Support (TLS 1.0-1.3), Vuln-Checks " +
        "(Heartbleed, ROBOT, BREACH, POODLE, FREAK, LOGJAM, …), HSTS-Configuration. " +
        "Wrappt testssl.sh.",
    defaultTimeoutMs: 240_000, // testssl ist langsam; 4min default

    isApplicable(target) {
        return (
            target.kind === "asset_domain" ||
            target.kind === "asset_subdomain" ||
            target.kind === "asset_url" ||
            target.kind === "asset_host"
        );
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const host = normalizeHost(ctx.target.value);

        // Pre-Check: DNS-resolvable? testssl würde sonst pro toter Subdomain
        // bis zum vollen Timeout rennen.
        const resolved = await resolveHost(host, 3_000);
        if (!resolved.resolvable) {
            return {
                success: false,
                findings: [],
                error: `host not resolvable: ${resolved.error ?? "no addresses"}`,
                durationMs: Date.now() - start,
            };
        }

        // Output-Datei in einem temp-Dir, damit das Worker-Verzeichnis sauber bleibt.
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "secu-testssl-"));
        const jsonFile = path.join(tmpDir, "out.json");

        try {
            const result = await spawnTool({
                binary: process.env.TESTSSL_BINARY ?? "testssl",
                args: [
                    "--quiet",
                    "--color", "0",
                    "--fast",
                    "--severity", "LOW",
                    "--jsonfile-pretty", jsonFile,
                    host,
                ],
                timeoutMs: ctx.timeoutMs,
                abortSignal: ctx.abortSignal,
                fallbackPaths: ["/usr/bin/testssl", "/usr/bin/testssl.sh", "/usr/local/bin/testssl"],
                // testssl exit 0 = no findings; 1+ = findings or warnings present.
                // Wir akzeptieren bis 4 (kritischer wäre Tool-Fehler).
                allowedExitCodes: [0, 1, 2, 3, 4],
            });

            if (!result.resolvedBinary) {
                return {
                    success: false,
                    findings: [],
                    error: result.error ?? "testssl binary not found",
                    durationMs: Date.now() - start,
                };
            }

            // JSON-Datei lesen (testssl --jsonfile-pretty Format ist verschachtelt:
            // { scanResult: [ { vulnerabilities: [...], ciphers: [...], ... } ] }
            // Flat-JSON (--jsonfile) wäre direkt ein Array, beides supporten.
            let raw: TestsslFinding[] = [];
            try {
                const txt = await fs.readFile(jsonFile, "utf8");
                const parsed = JSON.parse(txt);
                if (Array.isArray(parsed)) {
                    raw = parsed as TestsslFinding[];
                } else if (Array.isArray((parsed as { scanResult?: unknown[] }).scanResult)) {
                    raw = flattenScanResult(
                        (parsed as { scanResult: Record<string, unknown>[] }).scanResult,
                    );
                }
            } catch {
                // Datei nicht da oder kein JSON → leeren Befund melden, aber kein Fehler werfen
                if (!result.success) {
                    return {
                        success: false,
                        findings: [],
                        error: result.error ?? "testssl produced no JSON output",
                        durationMs: Date.now() - start,
                    };
                }
            }

            const findings = mapFindings(raw, host);

            return {
                success: true,
                rawOutput: {
                    host,
                    binary: result.resolvedBinary,
                    rawCount: raw.length,
                    mappedCount: findings.length,
                    durationMs: result.durationMs,
                    stderr: result.stderr.slice(-500),
                },
                findings,
                durationMs: Date.now() - start,
            };
        } finally {
            // best-effort cleanup
            try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    },
};

/**
 * testssl --jsonfile-pretty: scanResult[i] ist ein Objekt mit sub-arrays
 * (vulnerabilities, ciphers, serverDefaults, protocols, …). Wir flatten alle
 * Sub-Arrays in eine flache TestsslFinding-Liste.
 */
function flattenScanResult(scanResult: Record<string, unknown>[]): TestsslFinding[] {
    const out: TestsslFinding[] = [];
    // Felder, die in pretty-format Sub-Arrays mit Findings enthalten.
    const findingArrays = [
        "pretest",
        "protocols",
        "grease",
        "ciphers",
        "serverPreferences",
        "fs",
        "serverDefaults",
        "headerResponse",
        "vulnerabilities",
        "cipherTests",
        "browserSimulations",
        "rating",
    ];
    for (const target of scanResult) {
        for (const key of findingArrays) {
            const arr = target[key];
            if (Array.isArray(arr)) {
                for (const f of arr) {
                    if (f && typeof f === "object" && "id" in (f as object)) {
                        out.push(f as TestsslFinding);
                    }
                }
            }
        }
    }
    return out;
}

function normalizeHost(input: string): string {
    let v = input.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) {
        try { v = new URL(v).hostname; } catch { /* keep raw */ }
    }
    if (v.endsWith(".")) v = v.slice(0, -1);
    return v;
}

function mapFindings(raw: TestsslFinding[], host: string): FindingDraft[] {
    const out: FindingDraft[] = [];
    for (const r of raw) {
        if (!r.id || !r.severity) continue;
        const sevUpper = r.severity.toUpperCase();
        const mapped = SEV_MAP[sevUpper];
        if (!mapped) continue;
        if (mapped === "info") continue;          // kein Noise
        if (SUPPRESS_IDS.has(baseId(r.id))) continue;

        const cveIds = r.cve ? r.cve.split(/\s+/).filter((c) => c.startsWith("CVE-")) : undefined;
        const title = `[TLS] ${r.id}: ${shorten(r.finding ?? "(no description)", 120)}`;

        out.push({
            fingerprintInputs: ["tls_deep", host, r.id, sevUpper],
            severity: mapped,
            category: cveIds && cveIds.length ? "cve" : "tls",
            title,
            description: `testssl-Befund auf ${host} (Severity ${sevUpper}): ${r.finding ?? "(no description)"}`,
            recommendation: recommendationFor(r.id, sevUpper),
            cveIds,
            evidence: { id: r.id, severity: r.severity, finding: r.finding, cwe: r.cwe },
        });
    }
    return out;
}

function shorten(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function recommendationFor(id: string, sev: string): string {
    // Knappe ID-spezifische Hints; alles andere generisch.
    if (id.includes("BREACH")) return "HTTP-Compression (gzip/deflate) für Antworten mit Secrets/CSRF-Tokens deaktivieren oder masking-Header setzen.";
    if (id.includes("POODLE")) return "SSLv3-Support deaktivieren.";
    if (id.includes("ROBOT")) return "RSA-Key-Transport-Cipher deaktivieren, nur (EC)DHE-Cipher zulassen.";
    if (id.includes("LOGJAM")) return "DH-Parameter ≥2048 Bit, EXPORT-Ciphers deaktivieren.";
    if (id.includes("FREAK")) return "EXPORT-Cipher-Suites deaktivieren.";
    if (id.includes("HEARTBLEED")) return "OpenSSL ≥1.0.1g aktualisieren.";
    if (id.includes("DROWN")) return "SSLv2 server-seitig komplett deaktivieren.";
    if (id.includes("CRIME")) return "TLS-Compression deaktivieren.";
    if (id.includes("LUCKY13") || id.includes("SWEET32")) return "AEAD-Cipher (AES-GCM, ChaCha20-Poly1305) bevorzugen, CBC-Modes mit altem MAC deaktivieren.";
    if (id.includes("HSTS")) return "HSTS mit max-age ≥31536000, includeSubDomains, preload setzen.";
    if (sev === "CRITICAL" || sev === "HIGH") return "Fix dringend einplanen — Detail in evidence prüfen.";
    return "TLS-Konfiguration in Edge-/Reverse-Proxy anpassen (Mozilla SSL Config Generator als Referenz).";
}

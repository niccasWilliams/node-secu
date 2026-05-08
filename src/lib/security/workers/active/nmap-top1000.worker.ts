// Nmap Top-1000 Worker — Wrapper um nmap.
//
// Scope: active_safe.
// Begründung: nmap mit `-sV --top-ports 1000 -T3 -Pn` ist Standard-Connect-Scan
// auf die häufigsten 1000 TCP-Ports + Service-Version-Detection. Keine Exploits,
// keine Auth-Brute, keine OS-Stack-Manipulation. Branchenübliche "active_safe"-
// Rezeptur (CLAUDE.md §6 / Phase-2-Worker-Tabelle).
//
// Output: nmap -oX - (XML auf stdout), wir parsen die Ports/Services und mappen
// auf Findings. Offene Ports auf typischen Risiko-Services (SSH, RDP, DB-Ports)
// werden als info/medium-Findings reportet.

import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
} from "../worker.types";
import { spawnTool } from "../_lib/spawn-tool";
import { resolveHost } from "../_lib/resolve-host";

interface OpenPortInfo {
    portid: string;
    protocol: string;
    state: string;
    serviceName?: string;
    serviceProduct?: string;
    serviceVersion?: string;
    serviceTunnel?: string;
}

// Ports, deren öffentliche Exposition fast immer ein Befund ist.
const RISKY_PORTS: Record<string, { sev: FindingDraft["severity"]; reason: string }> = {
    "22":    { sev: "info",   reason: "SSH öffentlich. Brute-Force-Schutz (fail2ban, key-only Auth, MFA) muss da sein." },
    "23":    { sev: "high",   reason: "Telnet — unverschlüsselt, klartext credentials. Sofort abschalten." },
    "25":    { sev: "low",    reason: "SMTP. Open-Relay-Test + STARTTLS prüfen." },
    "139":   { sev: "high",   reason: "NetBIOS — gehört nicht ins Internet." },
    "445":   { sev: "high",   reason: "SMB — gehört nicht ins Internet (EternalBlue/Wormable)." },
    "1433":  { sev: "high",   reason: "MSSQL direkt erreichbar — sollte hinter VPN/Firewall." },
    "3306":  { sev: "high",   reason: "MySQL direkt erreichbar — sollte hinter VPN/Firewall." },
    "3389":  { sev: "medium", reason: "RDP — Brute-Force-Magnet, MFA + Network-Level-Auth Pflicht." },
    "5432":  { sev: "high",   reason: "PostgreSQL direkt erreichbar — sollte hinter VPN/Firewall." },
    "5984":  { sev: "high",   reason: "CouchDB — historische Default-Auth-Probleme." },
    "6379":  { sev: "high",   reason: "Redis direkt erreichbar — Default no-auth ist katastrophal." },
    "8080":  { sev: "low",    reason: "Alternative HTTP — prüfen ob Admin/Dev-Service freiliegt." },
    "8443":  { sev: "low",    reason: "Alternative HTTPS — prüfen ob Admin-Konsole freiliegt." },
    "9200":  { sev: "high",   reason: "Elasticsearch direkt erreichbar — Default no-auth = Daten-Exposure." },
    "11211": { sev: "high",   reason: "Memcached — UDP-Reflect-DDoS-Vektor." },
    "27017": { sev: "high",   reason: "MongoDB direkt erreichbar — historisch viele Daten-Leaks." },
};

export const nmapTop1000Worker: SecurityWorker = {
    jobKey: "nmap_top1000",
    requiredScope: "active_safe",
    description:
        "Port-Scan: nmap auf top 1000 TCP-Ports mit Service/Version-Detection. " +
        "Findet offene Ports, riskante Services (DB-Ports, Telnet, etc.).",
    defaultTimeoutMs: 360_000, // 6min — bei firewall-heavy Targets kann's länger dauern

    isApplicable(target) {
        return (
            target.kind === "asset_domain" ||
            target.kind === "asset_subdomain" ||
            target.kind === "asset_ip" ||
            target.kind === "asset_host"
        );
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const host = normalizeHost(ctx.target.value);

        const resolved = await resolveHost(host, 3_000);
        if (!resolved.resolvable) {
            return {
                success: false,
                findings: [],
                error: `host not resolvable: ${resolved.error ?? "no addresses"}`,
                durationMs: Date.now() - start,
            };
        }

        const result = await spawnTool({
            binary: process.env.NMAP_BINARY ?? "nmap",
            args: [
                "-Pn",                 // skip host discovery (firewalls dropping ICMP)
                "-T3",                 // moderates Timing — kein "Polite", kein "Aggressive"
                "--top-ports", "1000",
                "-sV",                 // service version detection
                "--version-intensity", "5",
                "--max-retries", "2",
                "--host-timeout", "240s",
                "-oX", "-",            // XML auf stdout
                host,
            ],
            timeoutMs: ctx.timeoutMs,
            abortSignal: ctx.abortSignal,
            fallbackPaths: ["/usr/bin/nmap", "/usr/local/bin/nmap"],
            allowedExitCodes: [0],
        });

        if (!result.resolvedBinary) {
            return {
                success: false,
                findings: [],
                error: result.error ?? "nmap binary not found",
                durationMs: Date.now() - start,
            };
        }

        if (!result.success) {
            return {
                success: false,
                findings: [],
                error: result.error ?? "nmap failed",
                durationMs: Date.now() - start,
                rawOutput: { stderr: result.stderr.slice(-500) },
            };
        }

        const ports = parseNmapXml(result.stdout);
        const findings = buildFindings(host, ports);

        return {
            success: true,
            rawOutput: {
                host,
                openPortCount: ports.length,
                ports: ports.map((p) => ({
                    port: p.portid,
                    proto: p.protocol,
                    service: p.serviceName,
                    version: p.serviceVersion,
                })),
                durationMs: result.durationMs,
            },
            findings,
            durationMs: Date.now() - start,
        };
    },
};

function normalizeHost(input: string): string {
    let v = input.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) {
        try { v = new URL(v).hostname; } catch { /* keep raw */ }
    }
    if (v.endsWith(".")) v = v.slice(0, -1);
    return v;
}

/**
 * Lightweight nmap-XML parser (regex-basiert) — kein zusätzliches Dependency-Lock,
 * deckt das ab was wir brauchen: open ports + service/version. nmap-XML ist stabil
 * genug, dass dieser Ansatz robust ist.
 */
function parseNmapXml(xml: string): OpenPortInfo[] {
    const out: OpenPortInfo[] = [];
    const portBlocks = xml.match(/<port\b[^>]*>[\s\S]*?<\/port>/g) ?? [];
    for (const block of portBlocks) {
        const portid = attr(block.match(/<port[^>]*\bportid="([^"]+)"/)?.[1]);
        const protocol = attr(block.match(/<port[^>]*\bprotocol="([^"]+)"/)?.[1]);
        const stateBlock = block.match(/<state\b[^>]*\/>/)?.[0] ?? "";
        const state = attr(stateBlock.match(/\bstate="([^"]+)"/)?.[1]);
        if (state !== "open") continue;

        const svcBlock = block.match(/<service\b[^>]*\/?>/)?.[0] ?? "";
        const serviceName = attr(svcBlock.match(/\bname="([^"]+)"/)?.[1]);
        const serviceProduct = attr(svcBlock.match(/\bproduct="([^"]+)"/)?.[1]);
        const serviceVersion = attr(svcBlock.match(/\bversion="([^"]+)"/)?.[1]);
        const serviceTunnel = attr(svcBlock.match(/\btunnel="([^"]+)"/)?.[1]);

        out.push({
            portid: portid ?? "?",
            protocol: protocol ?? "tcp",
            state,
            serviceName,
            serviceProduct,
            serviceVersion,
            serviceTunnel,
        });
    }
    return out;
}

function attr(v: string | undefined): string | undefined {
    if (!v) return undefined;
    return v
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
}

function buildFindings(host: string, ports: OpenPortInfo[]): FindingDraft[] {
    const findings: FindingDraft[] = [];
    if (ports.length === 0) return findings;

    // Riesige Anzahl offener Ports → Edge-Sharing-Hinweis (Anycast/CDN)
    if (ports.length >= 50) {
        findings.push({
            fingerprintInputs: ["nmap", host, "edge_sharing_pattern"],
            severity: "info",
            category: "config",
            title: `Edge-/Anycast-Sharing-Pattern: ${ports.length} offene Ports`,
            description:
                `Auf ${host} sind ${ports.length} TCP-Ports als open klassifiziert. Das ist typisch für ` +
                "Anycast-Edge-Netzwerke (Cloudflare, Railway, Fastly), die TCP-Handshakes auf allen Ports " +
                "akzeptieren aber Service-Probes droppen (`tcpwrapped` in nmap). Kein direktes Risiko, aber " +
                "die Origin-IP ist hinter dem Edge nicht direkt sichtbar — falls Origin-Bypass ein Issue ist, " +
                "Origin-IP via SNI/Cert-Cross-Reference prüfen.",
            recommendation: "Nur kontextuell relevant. Wenn Origin-IP-Discovery ein Risiko ist (DDoS-Bypass), DNS-History und Censys/Shodan auf Origin-IP-Disclosure prüfen.",
            evidence: { totalOpenPorts: ports.length, sample: ports.slice(0, 5) },
        });
    }

    // Per-Port-Findings
    for (const p of ports) {
        const risky = RISKY_PORTS[p.portid];
        if (risky) {
            findings.push({
                fingerprintInputs: ["nmap", host, p.portid, p.protocol],
                severity: risky.sev,
                category: "exposure",
                title: `Port ${p.portid}/${p.protocol} (${p.serviceName ?? "?"}) öffentlich`,
                description:
                    `${host}:${p.portid} (${p.serviceName ?? "?"}` +
                    (p.serviceProduct ? ` ${p.serviceProduct}` : "") +
                    (p.serviceVersion ? ` ${p.serviceVersion}` : "") +
                    `) ist von außen erreichbar. ${risky.reason}`,
                recommendation: risky.reason,
                evidence: {
                    port: p.portid,
                    protocol: p.protocol,
                    service: p.serviceName,
                    product: p.serviceProduct,
                    version: p.serviceVersion,
                },
            });
        }
    }

    return findings;
}

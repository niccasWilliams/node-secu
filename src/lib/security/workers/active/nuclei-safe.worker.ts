// Nuclei Safe-Scan Worker — Wrapper um nuclei (ProjectDiscovery).
//
// Scope: active_safe.
// Begründung: nuclei mit `-exclude-tags intrusive,dos,fuzz,brute-force,disclosure-aggressive`
// sendet ausschließlich nicht-intrusive Probes (typische CVE-Detections, Misconfig-Checks,
// Default-Cred-PROBES sind ausgeschlossen). Das deckt sich mit der "active_safe"-Definition
// in unserem Authorization-Modell (CLAUDE.md §6).
//
// Output: nuclei JSONL — wir parsen Zeile für Zeile, mappen severity → FindingDraft.

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
    SecurityWorker,
    WorkerContext,
    WorkerResult,
    FindingDraft,
    TechDraft,
} from "../worker.types";
import { spawnTool, parseJsonl } from "../_lib/spawn-tool";
import { resolveHost } from "../_lib/resolve-host";

interface NucleiResult {
    "template-id"?: string;
    "template-path"?: string;
    "template-url"?: string;
    info?: {
        name?: string;
        author?: string[];
        tags?: string[];
        description?: string;
        severity?: string;
        reference?: string[];
        classification?: {
            "cve-id"?: string[];
            "cwe-id"?: string[];
            "cvss-score"?: number;
            "cvss-metrics"?: string;
        };
    };
    type?: string;
    host?: string;
    "matched-at"?: string;
    "matcher-name"?: string;
    "matcher-status"?: boolean;
    timestamp?: string;
    "extracted-results"?: string[];
}

const SEVERITIES_DEFAULT = "low,medium,high,critical";
// Tags, die wir explizit ausschließen — alles was Edge der "active_safe"-Definition
// verletzen könnte (Brute-Force, DoS, intensive Fuzzing, Subdomain-Takeover-PoC).
const EXCLUDE_TAGS_DEFAULT = "intrusive,dos,fuzz,brute-force,disclosure-aggressive,fuzzing,sqli,rce";

export const nucleiSafeWorker: SecurityWorker = {
    jobKey: "nuclei_safe",
    requiredScope: "active_safe",
    description:
        "Vulnerability-Scanner via Nuclei (ProjectDiscovery, ~13k Templates). " +
        "Konfiguration: low/medium/high/critical Severity, ohne intrusive/dos/fuzz/brute-Tags.",
    defaultTimeoutMs: 600_000, // 10min default — bei full-template-set ggf. länger nötig

    isApplicable(target) {
        return (
            target.kind === "asset_domain" ||
            target.kind === "asset_subdomain" ||
            target.kind === "asset_url"
        );
    },

    async run(ctx: WorkerContext): Promise<WorkerResult> {
        const start = Date.now();
        const target = normalizeUrlTarget(ctx.target.value, ctx.target.kind);

        // Pre-Check: nuclei rennt sonst pro Template-Type bis ins eigene Timeout.
        const hostFromUrl = (() => {
            try { return new URL(target).hostname; } catch { return ctx.target.value; }
        })();
        const resolved = await resolveHost(hostFromUrl, 3_000);
        if (!resolved.resolvable) {
            return {
                success: false,
                findings: [],
                error: `host not resolvable: ${resolved.error ?? "no addresses"}`,
                durationMs: Date.now() - start,
            };
        }

        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "secu-nuclei-"));
        const outFile = path.join(tmpDir, "nuclei.jsonl");

        try {
            const severities = process.env.NUCLEI_SEVERITIES ?? SEVERITIES_DEFAULT;
            const excludeTags = process.env.NUCLEI_EXCLUDE_TAGS ?? EXCLUDE_TAGS_DEFAULT;
            const rateLimit = process.env.NUCLEI_RATE_LIMIT ?? "80";

            const result = await spawnTool({
                binary: process.env.NUCLEI_BINARY ?? "nuclei",
                args: [
                    "-u", target,
                    "-severity", severities,
                    "-exclude-tags", excludeTags,
                    "-jsonl",
                    "-jsonl-export", outFile,
                    "-no-color",
                    "-silent",
                    "-disable-update-check",
                    "-stats=false",
                    "-rate-limit", rateLimit,
                    "-timeout", "10",
                    "-retries", "1",
                    "-omit-raw",
                    "-omit-template",
                ],
                timeoutMs: ctx.timeoutMs,
                abortSignal: ctx.abortSignal,
                fallbackPaths: ["~/go/bin/nuclei", "/usr/local/bin/nuclei", "/usr/bin/nuclei"],
                allowedExitCodes: [0],
            });

            if (!result.resolvedBinary) {
                return {
                    success: false,
                    findings: [],
                    error: result.error ?? "nuclei binary not found",
                    durationMs: Date.now() - start,
                };
            }

            // Versuche zuerst Export-Datei, fallback auf stdout (manche Versionen
            // schreiben nur eines von beidem zuverlässig).
            let raw = "";
            try {
                raw = await fs.readFile(outFile, "utf8");
            } catch {
                raw = result.stdout;
            }
            if (!raw.trim()) raw = result.stdout;

            const rows = parseJsonl<NucleiResult>(raw);
            const { findings, tech } = mapResults(rows, target);

            // Trust-Telemetrie: nuclei [INF]-Lines aus stderr parsen (geht auch
            // mit -silent). Erwartet bei vollem Template-Set ~3-13k loaded.
            const stats = parseNucleiStats(result.stderr);
            const minTemplatesExpected = Number(process.env.NUCLEI_MIN_TEMPLATES ?? 1000);
            const looksTooFast = result.durationMs < 10_000 && stats.templatesLoaded == null;

            const rawOutput = {
                target,
                binary: result.resolvedBinary,
                rawCount: rows.length,
                mappedFindings: findings.length,
                tech: tech.length,
                durationMs: result.durationMs,
                severities,
                excludeTags,
                exitCode: result.exitCode,
                templatesLoaded: stats.templatesLoaded,
                templatesClustered: stats.templatesClustered,
                requestsTotal: stats.requestsTotal,
                stderrTail: result.stderr.slice(-500),
            };

            // 1) spawnTool meldet Fehler (Timeout, kein Binary, exit ≠ 0). Ein
            //    Tool das sauber lief und schlicht nichts fand, hätte exit=0.
            if (!result.success) {
                return {
                    success: false,
                    findings: [],
                    error: result.error ?? "nuclei did not exit cleanly",
                    durationMs: Date.now() - start,
                    exitCode: result.exitCode,
                    rawOutput,
                };
            }

            // 2) Sauberer Exit, aber stats sagen "0 templates geladen" oder
            //    Lauf war verdächtig kurz: das ist genau der Run-#7-Fall.
            //    Lieber als failed melden, damit der Operator weiß: hier muss
            //    nuclei manuell debuggt werden (Templates-Pfad, Network-Egress).
            if (stats.templatesLoaded != null && stats.templatesLoaded < minTemplatesExpected) {
                return {
                    success: false,
                    findings: [],
                    error: `nuclei loaded only ${stats.templatesLoaded} templates (min expected ${minTemplatesExpected}) — likely template-path / connectivity issue`,
                    durationMs: Date.now() - start,
                    exitCode: result.exitCode,
                    rawOutput,
                };
            }
            if (looksTooFast) {
                return {
                    success: false,
                    findings: [],
                    error: `nuclei completed in ${result.durationMs}ms with no template-load stats — suspicious, treating as failed`,
                    durationMs: Date.now() - start,
                    exitCode: result.exitCode,
                    rawOutput,
                };
            }

            return {
                success: true,
                rawOutput,
                findings,
                techFingerprints: tech,
                exitCode: result.exitCode,
                durationMs: Date.now() - start,
            };
        } finally {
            try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    },
};

function normalizeUrlTarget(input: string, kind: string): string {
    const v = input.trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    // Sub/Domain → assume https
    if (kind === "asset_subdomain" || kind === "asset_domain") return `https://${v}`;
    return v;
}

function mapResults(rows: NucleiResult[], target: string): { findings: FindingDraft[]; tech: TechDraft[] } {
    const findings: FindingDraft[] = [];
    const tech: TechDraft[] = [];
    const seen = new Set<string>();

    for (const r of rows) {
        const id = r["template-id"];
        const sev = (r.info?.severity ?? "info").toLowerCase();
        if (!id) continue;

        // Tech-Detection-Templates erzeugen Tech-Fingerprints, kein Finding.
        const tags = r.info?.tags ?? [];
        const isTechFingerprint = tags.includes("tech") || tags.includes("detect") || sev === "info";
        if (isTechFingerprint && (id.startsWith("tech-detect") || id.includes("detect"))) {
            tech.push({
                techName: r.info?.name ?? id,
                detectionSource: "nuclei",
                confidence: "medium",
                evidence: { templateId: id, matchedAt: r["matched-at"], extracted: r["extracted-results"] },
            });
            continue;
        }

        // Echtes Finding
        if (!isReportableSeverity(sev)) continue;

        const dedupeKey = `${id}::${r["matched-at"] ?? r.host ?? target}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const cveIds = r.info?.classification?.["cve-id"]?.map((c) => c.toUpperCase()) ?? [];
        const cvss = r.info?.classification?.["cvss-score"];

        findings.push({
            fingerprintInputs: ["nuclei", id, r["matched-at"] ?? r.host ?? target],
            severity: mapSeverity(sev),
            category: cveIds.length ? "cve" : categoryFromTags(tags),
            title: r.info?.name
                ? `[Nuclei] ${r.info.name}`
                : `[Nuclei] ${id}`,
            description:
                (r.info?.description ?? "Nuclei template match").trim() +
                `\n\nTemplate: ${id}\nMatched at: ${r["matched-at"] ?? r.host ?? target}`,
            recommendation: r.info?.reference?.length
                ? `Siehe Referenzen: ${r.info.reference.slice(0, 3).join(" | ")}`
                : "Template-spezifischen Fix prüfen (Template-ID + matched-at als Startpunkt).",
            cveIds: cveIds.length ? cveIds : undefined,
            cvssScore: cvss != null ? String(cvss) : undefined,
            evidence: {
                templateId: id,
                matchedAt: r["matched-at"],
                matcherName: r["matcher-name"],
                extracted: r["extracted-results"],
                tags,
            },
        });
    }
    return { findings, tech };
}

function isReportableSeverity(sev: string): boolean {
    return ["low", "medium", "high", "critical"].includes(sev);
}

function mapSeverity(sev: string): FindingDraft["severity"] {
    if (sev === "critical") return "critical";
    if (sev === "high") return "high";
    if (sev === "medium") return "medium";
    if (sev === "low") return "low";
    return "info";
}

interface NucleiStats {
    templatesLoaded: number | null;
    templatesClustered: number | null;
    requestsTotal: number | null;
}

/**
 * Parst nuclei [INF]-Lines aus stderr — auch mit `-silent` druckt nuclei
 * Template-Lade-Stats. Format-Beispiele (kann zwischen Versionen variieren):
 *   `[INF] Templates loaded for current scan: 7321`
 *   `[INF] Templates clustered: 1284 (Reduced 5872 Requests)`
 *   `[INF] Targets loaded for current scan: 1`
 */
function parseNucleiStats(stderr: string): NucleiStats {
    const out: NucleiStats = { templatesLoaded: null, templatesClustered: null, requestsTotal: null };
    if (!stderr) return out;

    const loaded = stderr.match(/Templates loaded for current scan:\s*(\d+)/i);
    if (loaded) out.templatesLoaded = Number(loaded[1]);

    const clustered = stderr.match(/Templates clustered:\s*(\d+)/i);
    if (clustered) out.templatesClustered = Number(clustered[1]);

    const reduced = stderr.match(/Reduced\s+(\d+)\s+Requests/i);
    if (reduced) out.requestsTotal = Number(reduced[1]);

    return out;
}

function categoryFromTags(tags: string[]): FindingDraft["category"] {
    const set = new Set(tags.map((t) => t.toLowerCase()));
    if (set.has("xss") || set.has("ssrf") || set.has("rce")) return "injection";
    if (set.has("misconfig") || set.has("config")) return "config";
    if (set.has("exposure") || set.has("file") || set.has("disclosure")) return "exposure";
    if (set.has("dns")) return "dns";
    if (set.has("ssl") || set.has("tls") || set.has("cert")) return "tls";
    if (set.has("auth") || set.has("login")) return "auth";
    if (set.has("cms") || set.has("wordpress") || set.has("drupal")) return "cms";
    return "config";
}

// Worker Interface — jeder Scan-Tool-Adapter implementiert dieses Contract.
//
// Ein Worker liefert Findings für ein konkretes Asset. Er kennt seine eigenen
// Authorization-Anforderungen (z.B. nuclei → active_safe, hydra → active_intrusive).
// Das Orchestrator-Layer prüft Authorization und ruft nur erlaubte Worker auf.

import type { Asset } from "@/db/individual/individual-schema";

export type WorkerJobKey =
    // Passive
    | "dns_records"
    | "tls_cert"
    | "http_headers"
    | "tech_detect"
    | "public_exposure"
    | "subdomain_passive"
    | "leak_check"
    // Active (require active_safe authorization)
    | "nuclei_safe"
    | "nmap_top1000"
    | "sslyze_deep"
    | "cms_scan"
    // Active intrusive (require active_intrusive authorization)
    | "nuclei_full"
    | "nmap_full"
    | "ffuf_dirs"
    | "sqlmap"
    | "hydra_login"
    | "wpscan_aggressive"
    // CVE
    | "cve_match";

export type AuthorizationScope = "passive_only" | "active_safe" | "active_intrusive";

export interface FindingDraft {
    fingerprintInputs: string[];     // Stabile Inputs für fingerprintHash (category + title + key evidence)
    severity: "critical" | "high" | "medium" | "low" | "info";
    category:
        | "dns" | "email_security" | "tls" | "http_headers" | "exposure"
        | "cms" | "auth" | "injection" | "cve" | "config" | "deps"
        | "cert" | "phishing" | "leak";
    title: string;
    description: string;
    evidence?: Record<string, unknown>;
    recommendation?: string;
    cveIds?: string[];
    cvssScore?: string;
}

export interface TechDraft {
    techName: string;
    version?: string;
    cpe?: string;
    detectionSource: "header" | "html" | "wappalyzer" | "nuclei" | "manual";
    confidence: "high" | "medium" | "low";
    evidence?: Record<string, unknown>;
}

export interface WorkerResult {
    success: boolean;
    rawOutput?: unknown;
    findings: FindingDraft[];
    techFingerprints?: TechDraft[];
    error?: string;
    durationMs: number;
}

export interface WorkerContext {
    asset: Asset;
    scanId: number;
    scanJobId: number;
    timeoutMs: number;
    // Out-of-band signal vom Orchestrator (z.B. User hat Scan abgebrochen)
    abortSignal?: AbortSignal;
}

export interface SecurityWorker {
    readonly jobKey: WorkerJobKey;
    readonly requiredScope: AuthorizationScope;
    readonly description: string;
    readonly defaultTimeoutMs: number;

    /** Prüft, ob dieser Worker für das gegebene Asset überhaupt sinnvoll ist (z.B. nur für domain, nicht für ip). */
    isApplicable(asset: Asset): boolean;

    /** Führt den Scan aus. */
    run(ctx: WorkerContext): Promise<WorkerResult>;
}

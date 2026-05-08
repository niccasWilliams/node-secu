// Worker Interface — jeder Scan-Tool-Adapter implementiert dieses Contract.
//
// Ein Worker liefert Findings für ein konkretes Target. Er kennt seine eigenen
// Authorization-Anforderungen (z.B. nuclei → active_safe, hydra → active_intrusive).
// Das Orchestrator-Layer prüft Authorization und ruft nur erlaubte Worker auf.
//
// Phase 0: WorkerTarget ist ein bewusst minimaler Shape (id, value, kind), damit die
// passiven Worker ohne Schema-Bindung kompilieren. Phase 1 mappt globale `entities`
// auf diesen Shape, ohne den Worker-Code anzufassen.

import type { AuthorizationScope } from "../authorization/authorization.types";

export type { AuthorizationScope };

export type WorkerJobKey =
    // Passive
    | "dns_records"
    | "tls_cert"
    | "http_headers"
    | "tech_detect"
    | "public_exposure"
    | "subdomain_passive"
    | "wp_passive_check"
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

/**
 * Persistenz-unabhängige Sicht des Workers auf sein Ziel.
 * `kind` ist absichtlich ein offener String — Phase 1 reicht hier z.B.
 * `"asset_domain"`, `"asset_ip"`, `"asset_url"` direkt aus dem Entity-Modell durch.
 */
export interface WorkerTarget {
    id: number | string;
    value: string;
    kind: string;
}

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
    detectionSource: "header" | "html" | "wappalyzer" | "nuclei" | "manual" | "dns" | "ct_log";
    confidence: "high" | "medium" | "low";
    evidence?: Record<string, unknown>;
}

/**
 * Eine Entity, die der Worker während des Runs entdeckt hat (z.B. Subdomains via crt.sh).
 * Der Runner persistiert sie als globale Entities und verlinkt sie mit dem aktuellen
 * Engagement. Der Worker selbst spricht nie mit der DB.
 */
export interface DiscoveredEntityDraft {
    /** Entity-Kind (asset_subdomain, asset_ip, …). */
    kind: string;
    /** Roher primärer Identifier (Hostname, IP, URL). */
    primaryValue: string;
    /** Anzeigename — default = primaryValue. */
    displayName?: string;
    /** Optionaler Diskriminator für canonical_key (selten nötig bei Assets). */
    discriminator?: string | null;
    /** Kind-spezifische Zusatzdaten (z.B. {ipFamily: 'v4'}). */
    data?: Record<string, unknown>;
    /** Optional: Beziehung zur Wurzel-Entity (subdomain → root domain etc.). */
    relationshipToRoot?: {
        kind: string;             // z.B. "subdomain_of", "resolves_to"
        direction?: "from_root_to_discovered" | "from_discovered_to_root";
        confidence?: number;
    };
    /** Quelle der Entdeckung — wird in entity_relationships.source übernommen. */
    source?: string;
}

export interface WorkerResult {
    success: boolean;
    rawOutput?: unknown;
    findings: FindingDraft[];
    techFingerprints?: TechDraft[];
    /** Vom Worker neu entdeckte Entities — werden vom Runner upserted und verlinkt. */
    discoveredEntities?: DiscoveredEntityDraft[];
    error?: string;
    durationMs: number;
}

export interface WorkerContext {
    target: WorkerTarget;
    workerRunId: number | string;
    timeoutMs: number;
    /** Out-of-band Signal vom Orchestrator (z.B. User hat Run abgebrochen). */
    abortSignal?: AbortSignal;
}

export interface SecurityWorker {
    readonly jobKey: WorkerJobKey;
    readonly requiredScope: AuthorizationScope;
    readonly description: string;
    readonly defaultTimeoutMs: number;

    /** Prüft, ob dieser Worker für das gegebene Target sinnvoll ist (z.B. nur für Domains, nicht für IPs). */
    isApplicable(target: WorkerTarget): boolean;

    /** Führt den Scan aus. */
    run(ctx: WorkerContext): Promise<WorkerResult>;
}

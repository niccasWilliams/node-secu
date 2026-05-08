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
    // Phase 5 — Deep Tech-Detection (passive_only)
    | "tech_fingerprint"
    // Phase 2.7 — OSINT Identity-Enrichment (alle passive_only)
    | "email_dns_signals"
    | "email_gravatar"
    | "email_github_commits"
    | "github_secret_scan"
    | "email_holehe_passive"
    | "email_breach_check"
    | "email_pattern_inference"
    | "email_alias_correlate"
    | "domain_ct_email_mining"
    | "domain_github_personnel"
    | "username_multiplatform"
    | "phone_normalize"
    | "social_account_validate"
    // Service-Layer (passive_only — leitet Service-Type aus bereits erfassten Signalen ab)
    | "service_classify"
    // Sprint 2 (OSINT-Engine) — Domain → Owner Worker. Alle passive_only.
    | "domain_whois_passive"
    | "domain_impressum_extract"
    | "domain_microsoft_tenant"
    | "domain_html_pivots_extract"
    // Sprint 3 (OSINT-Engine) — GitHub-Brand-Discovery. Alle passive_only.
    | "domain_github_brand"
    | "github_repos_public"
    | "github_events_public"
    // Active (require active_safe authorization)
    | "nuclei_safe"
    | "nmap_top1000"
    | "sslyze_deep"
    | "cms_scan"
    | "http_paths_probe"
    | "openapi_discovery"
    | "api_auth_probe"
    | "api_cors_check"
    | "api_rate_limit_safe"
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
        | "cert" | "phishing" | "leak"
        // Sprint 1.6 — DDG/TMG §5 Impressum-Compliance (genutzt von domain_impressum_extract)
        | "compliance_imprint";
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
    /**
     * Sprint 1.2 — optionale Provenance-Belege (features.md §2.2 + §2.7).
     *
     * Wenn der Worker eine OWNER-Hypothese, einen Cross-Domain-Pivot oder
     * eine sonstige nicht-faktische Discovery liefert, fügt er hier die
     * Evidence-Items an. Der playbook-runner reicht sie an
     * `confidenceService.aggregate()` und mergt das resultierende
     * `provenance`-Subobjekt in `entity.data.provenance`.
     *
     * Faktische Discoveries (z.B. DNS-A-Resolution, MX-Records) brauchen
     * KEIN Evidence-Feld — solche Entities bleiben ohne `provenance` und
     * werden als verifizierte Fakten gerendert.
     */
    evidence?: Array<{
        source: string;
        snippet?: string;
        /** 0.0..1.0 — Empfehlung pro Klasse: organic 0.5, hint_seeded 0.4. */
        confidenceContribution: number;
        evidenceClass: "organic" | "hint_seeded";
        hintRefs?: number[];
    }>;
    /**
     * Override für die `speculative`-Heuristik. Default = abgeleitet von
     * Confidence (< 0.6 → speculative=true). Nur setzen wenn der Worker
     * EXPLIZIT signalisieren will dass die Entity Hypothese ist (z.B.
     * `email_pattern_inference` generiert immer speculative=true Emails)
     * oder explizit als verifiziert markiert (z.B. WHOIS mit nicht-anonym
     * gemeldetem Owner = speculative=false).
     */
    speculativeOverride?: boolean;
}

export interface WorkerResult {
    success: boolean;
    rawOutput?: unknown;
    findings: FindingDraft[];
    techFingerprints?: TechDraft[];
    /** Vom Worker neu entdeckte Entities — werden vom Runner upserted und verlinkt. */
    discoveredEntities?: DiscoveredEntityDraft[];
    /**
     * Phase 2.7 — additive Patch der Source-Entity-Daten (entities.data jsonb).
     * Wird vom Runner shallow-merged in das bestehende data-Objekt der Source-Entity.
     * Nutzbar für Worker, die das *Wissen über das Target* anreichern, statt neue
     * Entities zu entdecken (z.B. phone_normalize → e164, social_validate → lastSeenAt).
     */
    entityDataPatch?: Record<string, unknown>;
    /**
     * Phase 4.5 (Trust-Layer) — Exit-Code des unterliegenden Tools, falls CLI-basiert.
     * Wird vom Runner nach `secu_worker_runs.exit_code` persistiert. Nicht-CLI-Worker
     * (HTTP-Probes, OSINT-API-Calls) lassen das Feld undefined.
     */
    exitCode?: number | null;
    error?: string;
    durationMs: number;
}

export interface WorkerContext {
    target: WorkerTarget;
    workerRunId: number | string;
    timeoutMs: number;
    /**
     * Sprint 2 #7 — Engagement-Kontext, den der Worker für Provider-Klassifikation
     * (`infrastructureProviderService.classifyAndPersistIfInfra`), Hint-Konsum
     * (`hintService.getBundle()`) und Pivot-Persistierung (DNS/HTML-Pivots,
     * Sprint 5) braucht. Ist optional, weil ad-hoc-Worker-Aufrufe ohne Engagement-
     * Kontext für reine "isApplicable + run"-Smoke-Tests legitim sind. Worker
     * fallen gracefully zurück (kein classifyAndPersistIfInfra wenn fehlend).
     */
    engagementId?: number;
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

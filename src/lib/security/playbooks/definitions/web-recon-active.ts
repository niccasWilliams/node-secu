// Playbook: `web_recon_active`
//
// Erweiterung von `web_recon_passive` mit den Phase-3 Active-Safe-Workern und
// Phase-2.7 OSINT-Organization-Recon. Voraussetzung: Engagement hat eine
// Authorization mit Scope `active_safe` (oder strikter) — der Authorization-
// Gate weist sonst die Steps ab.
//
// Ablauf (Reihenfolge folgt dem "low-friction first"-Prinzip):
//
//   1. recon_subdomains       ─ subdomain_passive (subfinder + crt.sh)
//   2. dns_records             ─ Fan-out: Wurzel + alle entdeckten Subdomains
//   3. tls_cert                ─ Fan-out (passiv, Cert-Validität)
//   4. http_headers            ─ Fan-out + Tech-Detection
//   5. wp_passive_check        ─ wenn WordPress detected
//   6. tls_deep                ─ active_safe; testssl auf Wurzel + Subdomains
//   7. nmap_top1000            ─ active_safe; Wurzel + Subdomains
//   8. nuclei_safe             ─ active_safe; Wurzel + Subdomains (~13k Templates)
//   9. http_paths_probe        ─ active_safe; robots.txt + /api/health + Auth-Gate
//  10. service_classify        ─ passive; Service-Type pro Host (web/api/mail/…)
//  11. ct_email_mining         ─ passive OSINT; CT-RFC822-SAN-Email-Mining (Apex)
//  12. github_personnel        ─ passive OSINT; GitHub-User mit Apex-Email
//  13. email_pattern_inference ─ passive OSINT; Pattern-Inferenz aus Sample
//
// Per-Email/Per-User-Chains (osint_email_passive / osint_username_passive)
// werden NICHT hier explizit verdrahtet — sobald die Steps 11-13 emails oder
// usernames als Entities erzeugen, feuern Rules 4 + 5 automatisch die
// per-entity-Chains. Das hält die Run-ID-Granularität sauber: ein
// web_recon_active = ein Run, plus N getriggerte sub-runs.
//
// Sprint-2-Owner-Discovery (rootOnly, parallel zur Subdomain-Enum):
//   domain_whois_passive / domain_impressum_extract / domain_microsoft_tenant /
//   domain_html_pivots_extract — siehe web-recon-passive.ts für die Begründung.
//
// Warum OSINT-Steps NUR auf der Apex-Domain (rootOnly):
// Wildcard-Zertifikate (*.example.com) stellen pro CT-Log einen separaten
// Sub-Eintrag dar — würden wir CT-Mining pro Subdomain ausführen, gäbe es
// massenweise false-positive-Personen aus reinen DNS-Artefakten. Rule 6 ist
// genau aus diesem Grund disabled; wir lösen das hier durch explizit-rootOnly.

import type { Entity } from "@/db/individual/individual-schema";
import type { Playbook, PlaybookContext, PlaybookTarget } from "../playbook.types";

function entityToTarget(e: Entity): PlaybookTarget {
    return { id: e.id, value: e.canonicalKey, kind: e.kind };
}

function rootOnly(ctx: PlaybookContext): PlaybookTarget[] {
    return [entityToTarget(ctx.rootEntity)];
}

function rootPlusDiscoveredHosts(ctx: PlaybookContext): PlaybookTarget[] {
    const seen = new Set<number>();
    const out: PlaybookTarget[] = [];
    for (const e of ctx.discoveredEntities) {
        if (seen.has(e.id)) continue;
        if (e.kind === "asset_domain" || e.kind === "asset_subdomain" || e.kind === "asset_url") {
            out.push(entityToTarget(e));
            seen.add(e.id);
        }
    }
    return out;
}

/**
 * Sprint 3 — alle social_account-Entities mit data.platform="github" einsammeln.
 * Dependent steps (github_repos_public, github_events_public) targeten genau diese.
 */
function githubSocialAccounts(ctx: PlaybookContext): PlaybookTarget[] {
    const out: PlaybookTarget[] = [];
    for (const e of ctx.discoveredEntities) {
        if (e.kind !== "social_account") continue;
        const data = (e.data ?? {}) as Record<string, unknown>;
        if (data.platform !== "github") continue;
        out.push(entityToTarget(e));
    }
    return out;
}

function anyEntityHasWordPress(ctx: PlaybookContext): boolean {
    for (const set of Object.values(ctx.techByEntityId)) {
        for (const tech of set) {
            if (tech.includes("wordpress")) return true;
        }
    }
    return false;
}

export const webReconActivePlaybook: Playbook = {
    key: "web_recon_active",
    label: "Web Recon (Active-Safe)",
    description:
        "Vollständiger Recon einer Domain inkl. aktiver Tools: Subdomain-Enumeration, " +
        "DNS-Hygiene, TLS-Audit (Cipher/Vuln-Detection via testssl), Port-Scan (nmap top 1000), " +
        "und Vulnerability-Scan (Nuclei mit ~13k Templates, ohne intrusive/dos/fuzz/brute-Tags). " +
        "Voraussetzung: Engagement hat active_safe-Authorization für die Wurzel-Entity.",
    acceptsRootEntityKinds: ["asset_domain"],
    maxRequiredScope: "active_safe",
    steps: [
        {
            key: "recon_subdomains",
            label: "Subdomain-Enumeration (subfinder + crt.sh)",
            workerKey: "subdomain_passive",
            targets: rootOnly,
            timeoutMs: 120_000,
        },
        {
            key: "dns_records",
            label: "DNS-Hygiene (SPF/DMARC/CAA/DNSSEC)",
            workerKey: "dns_records",
            dependsOn: ["recon_subdomains"],
            targets: rootPlusDiscoveredHosts,
        },
        {
            key: "tls_cert",
            label: "TLS-Zertifikat-Validität",
            workerKey: "tls_cert",
            dependsOn: ["recon_subdomains"],
            targets: rootPlusDiscoveredHosts,
        },
        {
            key: "http_headers",
            label: "HTTP-Security-Header + Tech-Detection (rudimentär)",
            workerKey: "http_headers",
            dependsOn: ["recon_subdomains"],
            targets: rootPlusDiscoveredHosts,
        },
        {
            key: "tech_fingerprint",
            label: "Tech-Stack-Fingerprint (Wappalyzer-equivalent, body+cookies+scripts)",
            workerKey: "tech_fingerprint",
            dependsOn: ["http_headers"],
            targets: rootPlusDiscoveredHosts,
            timeoutMs: 30_000,
        },
        {
            key: "wp_passive_check",
            label: "WordPress-Versions-Check (passiv)",
            workerKey: "wp_passive_check",
            dependsOn: ["tech_fingerprint"],
            when: anyEntityHasWordPress,
            skipReason: "no_wordpress_detected",
            targets: (ctx) => {
                const hits: PlaybookTarget[] = [];
                for (const e of ctx.discoveredEntities) {
                    const set = ctx.techByEntityId[e.id];
                    if (set && [...set].some((t) => t.includes("wordpress"))) {
                        hits.push(entityToTarget(e));
                    }
                }
                return hits;
            },
        },
        {
            key: "tls_deep",
            label: "TLS Deep-Audit (testssl: Cipher, Vulns, BREACH/POODLE/…)",
            workerKey: "sslyze_deep",
            dependsOn: ["recon_subdomains"],
            targets: rootPlusDiscoveredHosts,
            timeoutMs: 240_000,
        },
        {
            key: "nmap_top1000",
            label: "Port-Scan (nmap top 1000 + service detection)",
            workerKey: "nmap_top1000",
            dependsOn: ["recon_subdomains"],
            targets: rootPlusDiscoveredHosts,
            timeoutMs: 360_000,
        },
        {
            key: "nuclei_safe",
            label: "Vulnerability-Scan (Nuclei, ~13k Templates, safe-tags)",
            workerKey: "nuclei_safe",
            dependsOn: ["recon_subdomains"],
            targets: rootPlusDiscoveredHosts,
            timeoutMs: 600_000,
        },
        {
            key: "http_paths_probe",
            label: "HTTP-Pfade Probe (robots.txt, /api/health, Auth-Gate, HTTP-Methoden)",
            workerKey: "http_paths_probe",
            dependsOn: ["recon_subdomains"],
            targets: rootPlusDiscoveredHosts,
            timeoutMs: 90_000,
        },
        {
            key: "service_classify",
            label: "Service-Type-Klassifikation (webserver/rest_api/spa/mailserver/…)",
            workerKey: "service_classify",
            dependsOn: ["http_headers", "tech_fingerprint", "nmap_top1000", "http_paths_probe"],
            targets: rootPlusDiscoveredHosts,
            timeoutMs: 30_000,
        },
        // Sprint-2 Owner-Discovery — rootOnly, parallel zum Subdomain-Fan-out.
        {
            key: "domain_whois_passive",
            label: "OSINT — RDAP/WHOIS (Owner-Name + Email + Adresse)",
            workerKey: "domain_whois_passive",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
        {
            key: "domain_impressum_extract",
            label: "OSINT — Impressum-Crawler (§5 + Cross-Domain-NER)",
            workerKey: "domain_impressum_extract",
            targets: rootOnly,
            timeoutMs: 60_000,
        },
        {
            key: "domain_microsoft_tenant",
            label: "OSINT — M365/Entra-ID Tenant-Detect",
            workerKey: "domain_microsoft_tenant",
            targets: rootOnly,
            timeoutMs: 15_000,
        },
        {
            key: "domain_html_pivots_extract",
            label: "OSINT — Tracking-IDs + Build-Hashes (GA/GTM/Pixel/Webpack/Vite/Sentry)",
            workerKey: "domain_html_pivots_extract",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
        {
            key: "ct_email_mining",
            label: "OSINT — CT-Logs RFC822-SAN-Email-Mining (Apex)",
            workerKey: "domain_ct_email_mining",
            targets: rootOnly,
            timeoutMs: 120_000,
        },
        {
            key: "github_personnel",
            label: "OSINT — GitHub-User mit Apex-Email (search/users)",
            workerKey: "domain_github_personnel",
            targets: rootOnly,
            skipReason: "github_token_missing",
            timeoutMs: 60_000,
        },
        {
            key: "github_brand_search",
            label: "OSINT — GitHub-User per SLD-Brand-Match (+ Hints)",
            workerKey: "domain_github_brand",
            targets: rootOnly,
            skipReason: "github_token_missing",
            timeoutMs: 90_000,
        },
        {
            key: "github_repos",
            label: "OSINT — Public Repos der gefundenen GitHub-Accounts",
            workerKey: "github_repos_public",
            dependsOn: ["github_personnel", "github_brand_search"],
            targets: githubSocialAccounts,
            skipReason: "no_github_social_accounts",
            timeoutMs: 30_000,
        },
        {
            key: "github_events",
            label: "OSINT — Commit-Author-Email-Mining aus public PushEvents",
            workerKey: "github_events_public",
            dependsOn: ["github_personnel", "github_brand_search"],
            targets: githubSocialAccounts,
            skipReason: "no_github_social_accounts",
            timeoutMs: 30_000,
        },
        {
            key: "email_pattern_inference",
            label: "OSINT — Statistische Email-Pattern-Inferenz",
            workerKey: "email_pattern_inference",
            dependsOn: ["ct_email_mining", "github_personnel", "github_events"],
            targets: rootOnly,
            skipReason: "insufficient_email_sample",
            timeoutMs: 30_000,
        },
    ],
};

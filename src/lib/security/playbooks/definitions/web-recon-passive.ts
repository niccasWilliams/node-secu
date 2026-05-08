// Playbook: `web_recon_passive`
//
// Erstes Phase-2-Playbook. Vollständig passiv: kein Traffic ans Ziel über
// einen einzelnen Public-HTTP-/DNS-/TLS-Connect hinaus, plus crt.sh-OSINT.
//
// Ablauf:
//
//   1. recon_subdomains  ─ subdomain_passive auf Wurzel-Domain
//                          → entdeckt asset_subdomain-Entities (CT-Logs)
//   2. dns_records        ─ Fan-out: Wurzel + alle entdeckten Subdomains
//   3. tls_cert           ─ Fan-out: Wurzel + alle entdeckten Subdomains
//   4. http_headers       ─ Fan-out: Wurzel + alle entdeckten Subdomains
//   5. wp_passive_check   ─ Tech-aware Step: läuft nur, wenn HTTP-Headers-Step
//                          oder ein vorheriger Tech-Eintrag "wordpress" enthält.
//                          Demonstriert die "skipped wegen condition"-Mechanik.

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

export const webReconPassivePlaybook: Playbook = {
    key: "web_recon_passive",
    label: "Web Recon (Passive)",
    description:
        "Passive Aufklärung einer Domain: Subdomain-Enumeration via crt.sh, " +
        "anschließend DNS-Hygiene, TLS-Zertifikat und HTTP-Security-Header für " +
        "Root-Domain und alle entdeckten Subdomains. Tech-aware Folge-Step für " +
        "WordPress, falls erkannt. Kein aktiver Scan-Traffic.",
    acceptsRootEntityKinds: ["asset_domain"],
    maxRequiredScope: "passive_only",
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
            label: "TLS-Zertifikat",
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
                // Nur die Hosts targeten, deren Tech-Set "wordpress" enthält.
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
            key: "service_classify",
            label: "Service-Type-Klassifikation (web/api/mail/…)",
            workerKey: "service_classify",
            dependsOn: ["http_headers", "tech_fingerprint"],
            targets: rootPlusDiscoveredHosts,
            timeoutMs: 30_000,
        },
        {
            key: "ct_email_mining",
            label: "OSINT — CT-Logs Email-Mining (Apex)",
            workerKey: "domain_ct_email_mining",
            targets: rootOnly,
            timeoutMs: 60_000,
        },
        {
            key: "github_personnel",
            label: "OSINT — GitHub-User mit Apex-Email",
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
            label: "OSINT — Email-Pattern-Inferenz",
            workerKey: "email_pattern_inference",
            dependsOn: ["ct_email_mining", "github_personnel", "github_events"],
            targets: rootOnly,
            skipReason: "insufficient_email_sample",
            timeoutMs: 30_000,
        },
    ],
};

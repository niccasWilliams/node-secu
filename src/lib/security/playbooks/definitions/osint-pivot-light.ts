// Sprint 1.4 (OSINT-Engine, features.md §2.3) — Mini-Playbook für Cross-Domain-Pivots.
//
// PROBLEM: Wenn ein Worker eine zweite Domain für denselben Owner findet
// (Tracking-ID-Match, Cert-SAN-Sharing, Impressum-Cross-Reference, NS-Pair),
// soll automatisch eine schnelle Triage-Substanz für diese Pivot-Domain
// vorliegen — aber kein voller `web_recon_passive`-Lauf, weil das die
// Hop-Explosion und das OSINT-Budget killt.
//
// ANTWORT: 5-Step-Mini-Playbook mit den passiven Owner-Identifikations-
// Kernworkers. Liefert dem Operator die "ist diese Pivot-Domain wirklich
// derselbe Owner?"-Frage in <30s pro Pivot-Domain:
//
//   - dns_records           → DMARC-Owner-Email, NS-Pair, MX-Provider
//   - tls_cert              → Cert-Subject (CN/O), SAN-Cross-Domain-Hint
//   - http_headers          → Server-Banner, Cookies (Custom-Branding)
//   - domain_whois_passive  → RDAP-Owner-Name + -Email + -Adresse
//   - domain_impressum_extract → DE-§5-Impressum mit Cross-Domain-Mentions
//
// Bewusst KEINE Subdomain-Enumeration, KEIN HTML-Pivots-Extract (das löst
// die naechsten Hops aus), KEIN Active-Scan. Pivot bleibt `role=pivot` —
// Operator muss explizit auf `in_scope` heraufstufen, damit `web_recon_active`
// laufen darf (siehe features.md §2.3).
//
// AUTO-CHAIN-TRIGGER (kommt in Sprint 5 als Rule, hier nur DOKUMENTIERT):
//   - entity.created mit kind=asset_domain UND data.engagementRole='pivot'
//     → start_playbook osint_pivot_light, parentRunId=auslösender Run
//
// HOP-BUDGET: Da der Auslöser typisch in Hop 1 (Cross-Domain aus Impressum
// /DNS-Pivot des Engagement-Roots) liegt, läuft osint_pivot_light auf Hop 2
// — das ist innerhalb des Default-Limits engagements.osintMaxHops=2.

import type { Entity } from "@/db/individual/individual-schema";
import type { Playbook, PlaybookContext, PlaybookTarget } from "../playbook.types";

function entityToTarget(e: Entity): PlaybookTarget {
    return { id: e.id, value: e.canonicalKey, kind: e.kind };
}

function rootOnly(ctx: PlaybookContext): PlaybookTarget[] {
    return [entityToTarget(ctx.rootEntity)];
}

export const osintPivotLightPlaybook: Playbook = {
    key: "osint_pivot_light",
    label: "OSINT — Cross-Domain Pivot (Light)",
    description:
        "Schnell-Triage für eine via Cross-Domain-Pivot entdeckte Domain — DNS-Owner-" +
        "Signale, TLS-Subject, HTTP-Banner, RDAP-/DENIC-Owner und DE-Impressum. Liefert " +
        "Substanz zur Frage 'gehört diese Pivot-Domain wirklich demselben Customer?', " +
        "OHNE Subdomain-Enumeration und OHNE Active-Scans (Operator muss zuerst auf " +
        "in_scope heraufstufen).",
    acceptsRootEntityKinds: ["asset_domain", "asset_subdomain"],
    maxRequiredScope: "passive_only",
    steps: [
        {
            key: "dns_records",
            label: "DNS-Hygiene + DMARC-Owner-Email + NS-Pair",
            workerKey: "dns_records",
            targets: rootOnly,
        },
        {
            key: "tls_cert",
            label: "TLS-Zertifikat (Subject + SAN-Hint)",
            workerKey: "tls_cert",
            targets: rootOnly,
        },
        {
            key: "http_headers",
            label: "HTTP-Security-Header + Server-Banner",
            workerKey: "http_headers",
            targets: rootOnly,
        },
        {
            key: "domain_whois_passive",
            label: "WHOIS / RDAP — Owner-Name + Email + Adresse",
            workerKey: "domain_whois_passive",
            targets: rootOnly,
            timeoutMs: 20_000,
        },
        {
            key: "domain_impressum_extract",
            label: "Impressum-Crawler (DE-§5 + Cross-Domain-NER)",
            workerKey: "domain_impressum_extract",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
    ],
};

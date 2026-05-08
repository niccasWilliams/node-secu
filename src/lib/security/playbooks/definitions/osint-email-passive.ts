// Phase 2.7 — Playbook: `osint_email_passive`.
//
// Trigger:  email_address-Entity (manuell via API oder via Rule-Engine bei
//           entity.created kind=email_address).
// Ablauf (alle Steps parallel-fähig — Runner topologisch):
//   1. email_dns_signals          — MX/SPF/DMARC/DKIM-Selektoren
//   2. email_gravatar             — Gravatar-Profil + verlinkte Social-Accounts
//   3. email_github_commits       — GitHub-Login(s) aus Commit-Historie
//   4. email_holehe_passive       — Plattform-Existenz auf ~40 Diensten
//   5. email_breach_check         — HIBP (skipped wenn API-Key fehlt)
//   6. email_alias_correlate      — lokale Plus/lower/gmail↔googlemail-Aliase
//
// Discovered usernames/socials → Events → Rule-Engine triggert
// osint_username_passive für die neuen Username-Entities.

import type { Playbook, PlaybookContext, PlaybookTarget } from "../playbook.types";

function rootOnly(ctx: PlaybookContext): PlaybookTarget[] {
    return [{ id: ctx.rootEntity.id, value: ctx.rootEntity.canonicalKey, kind: ctx.rootEntity.kind }];
}

export const osintEmailPassivePlaybook: Playbook = {
    key: "osint_email_passive",
    label: "OSINT — Email Passive Enrichment",
    description:
        "Anreicherung einer Email-Adresse aus rein öffentlichen Quellen: DNS-Signale " +
        "(MX/SPF/DMARC/DKIM), Gravatar, GitHub-Commits, Plattform-Existenz (Holehe), " +
        "HIBP-Breach-Check und lokale Alias-Korrelation. Discovered Entities (social_" +
        "account, username) werden persistiert und können weitere Chains auslösen.",
    acceptsRootEntityKinds: ["email_address"],
    maxRequiredScope: "passive_only",
    steps: [
        {
            key: "email_dns_signals",
            label: "Email-Domain DNS-Signale (MX/SPF/DMARC/DKIM)",
            workerKey: "email_dns_signals",
            targets: rootOnly,
        },
        {
            key: "email_gravatar",
            label: "Gravatar-Profil-Lookup",
            workerKey: "email_gravatar",
            targets: rootOnly,
        },
        {
            key: "email_github_commits",
            label: "GitHub-Commit-Mining (Login-Discovery)",
            workerKey: "email_github_commits",
            targets: rootOnly,
            skipReason: "github_token_missing_or_no_hits",
        },
        {
            key: "email_holehe_passive",
            label: "Plattform-Existenz via Holehe (kuratiert ToS-konform)",
            workerKey: "email_holehe_passive",
            targets: rootOnly,
            skipReason: "holehe_no_modules_or_proxy_unconfigured",
        },
        {
            key: "email_breach_check",
            label: "Breach-Check (HIBP)",
            workerKey: "email_breach_check",
            targets: rootOnly,
            skipReason: "no_breach_provider_configured",
        },
        {
            key: "email_alias_correlate",
            label: "Lokale Alias-Korrelation (Plus-Tag / Lowercase / gmail↔googlemail)",
            workerKey: "email_alias_correlate",
            targets: rootOnly,
        },
    ],
};

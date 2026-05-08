// Phase 2.7 — Playbook: `osint_organization_recon`.
//
// Trigger: asset_domain (manuell oder via Rule wenn primary_target).
// Ablauf:
//   1. domain_ct_email_mining + domain_github_personnel parallel
//   2. email_pattern_inference auf den entdeckten Sample
//
// Discovered emails feuern Events → Rule-Engine triggert für jede Email
// `osint_email_passive` (eigene Chain).

import type { Playbook, PlaybookContext, PlaybookTarget } from "../playbook.types";

function rootOnly(ctx: PlaybookContext): PlaybookTarget[] {
    return [{ id: ctx.rootEntity.id, value: ctx.rootEntity.canonicalKey, kind: ctx.rootEntity.kind }];
}

export const osintOrganizationReconPlaybook: Playbook = {
    key: "osint_organization_recon",
    label: "OSINT — Organization Domain Recon",
    description:
        "Recon einer Ziel-Domain auf Personnel-Spuren: Emails aus CT-Logs (RFC822-SAN), " +
        "GitHub-User mit Email auf der Domain, statistische Email-Pattern-Inferenz aus " +
        "dem Sample. Alle entdeckten Emails lösen weiterführende Per-Email-Chains aus.",
    acceptsRootEntityKinds: ["asset_domain", "asset_subdomain"],
    maxRequiredScope: "passive_only",
    steps: [
        {
            key: "ct_email_mining",
            label: "CT-Logs RFC822-SAN-Email-Mining",
            workerKey: "domain_ct_email_mining",
            targets: rootOnly,
        },
        {
            key: "github_personnel",
            label: "GitHub-Personnel via search/users",
            workerKey: "domain_github_personnel",
            targets: rootOnly,
            skipReason: "github_token_missing",
        },
        {
            key: "email_pattern_inference",
            label: "Statistische Email-Pattern-Inferenz",
            workerKey: "email_pattern_inference",
            dependsOn: ["ct_email_mining", "github_personnel"],
            targets: rootOnly,
            skipReason: "insufficient_email_sample",
        },
    ],
};

// Phase 2.7 — Playbook: `osint_username_passive`.
//
// Trigger: username-Entity. Steps:
//   1. username_multiplatform — kuratierte Plattform-DB (verified-Tier default,
//      candidate-Tier opt-in via env USERNAME_PLATFORM_TIER=both)
//   2. social_account_validate — pro entdeckter social_account die Reachability
//      checken und displayName/bio/lastSeenAt nachpflegen.

import type { Playbook, PlaybookContext, PlaybookTarget } from "../playbook.types";

function rootOnly(ctx: PlaybookContext): PlaybookTarget[] {
    return [{ id: ctx.rootEntity.id, value: ctx.rootEntity.canonicalKey, kind: ctx.rootEntity.kind }];
}

function socialAccountsFromMultiplatform(ctx: PlaybookContext): PlaybookTarget[] {
    const out: PlaybookTarget[] = [];
    for (const e of ctx.discoveredEntities) {
        if (e.kind === "social_account") {
            out.push({ id: e.id, value: e.canonicalKey, kind: e.kind });
        }
    }
    return out;
}

export const osintUsernamePassivePlaybook: Playbook = {
    key: "osint_username_passive",
    label: "OSINT — Username Multi-Platform Recon",
    description:
        "Sucht den Username über kuratierte Plattform-DB (WhatsMyName-Tier verified, " +
        "Sherlock/Maigret-Tier candidate optional). Validiert pro Hit die Reachability + " +
        "extrahiert displayName/bio aus Public-Profile-HTML.",
    acceptsRootEntityKinds: ["username"],
    maxRequiredScope: "passive_only",
    steps: [
        {
            key: "username_multiplatform",
            label: "Multi-Platform Existenz-Check",
            workerKey: "username_multiplatform",
            targets: rootOnly,
        },
        {
            key: "social_account_validate",
            label: "Profil-Reachability + Metadaten",
            workerKey: "social_account_validate",
            dependsOn: ["username_multiplatform"],
            targets: socialAccountsFromMultiplatform,
            skipReason: "no_social_accounts_discovered",
        },
    ],
};

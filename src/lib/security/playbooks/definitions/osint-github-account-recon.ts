// Sprint 3 (OSINT-Engine, features.md §3.3 #29b/c) — osint_github_account_recon.
//
// Mini-Playbook für einen GitHub-Account, der NICHT durch domain_github_brand
// im aktuellen Lauf entdeckt wurde — sondern via email_github_commits (Hop 2)
// oder per manueller Operator-Promotion entstanden ist. Liefert die zwei
// Anreicherungs-/Discovery-Schritte in einem Aufruf:
//
//   - github_repos_public  → publicRepos[] + repoLanguages[] in entity.data
//   - github_events_public → Commit-Author-Email-Mining (personal/corporate/noreply)
//
// Bewusst KEIN domain_github_brand-Aufruf: dieses Playbook akzeptiert
// social_account direkt als Root-Entity, keine Domain-zu-Account-Brücke nötig.
//
// AUTO-CHAIN (default DISABLED, ensureRule in bootstrap.ts):
//   entity.created mit kind=social_account UND data.platform="github"
//   → start_playbook osint_github_account_recon
//
// HOP-BUDGET: Wenn der social_account Hop 1 ist (z.B. aus osint_email_passive),
// landet dieses Playbook auf Hop 2 — innerhalb des Default-Limits
// engagements.osintMaxHops=2.

import type { Entity } from "@/db/individual/individual-schema";
import type { Playbook, PlaybookContext, PlaybookTarget } from "../playbook.types";

function entityToTarget(e: Entity): PlaybookTarget {
    return { id: e.id, value: e.canonicalKey, kind: e.kind };
}

function rootOnly(ctx: PlaybookContext): PlaybookTarget[] {
    return [entityToTarget(ctx.rootEntity)];
}

export const osintGithubAccountReconPlaybook: Playbook = {
    key: "osint_github_account_recon",
    label: "OSINT — GitHub Account Recon (Repos + Events)",
    description:
        "Reichert einen entdeckten GitHub-social_account um öffentliche Repos und " +
        "Commit-Author-Emails an. Repos liefern Tech-Profil + Aktivitäts-Indikator; " +
        "Events leaken Privat-/Corporate-Emails, die nicht im GitHub-Profil " +
        "öffentlich sind. Akzeptiert nur social_account-Root mit data.platform=github.",
    acceptsRootEntityKinds: ["social_account"],
    maxRequiredScope: "passive_only",
    steps: [
        {
            key: "github_repos",
            label: "Public Repos + Top-Languages",
            workerKey: "github_repos_public",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
        {
            key: "github_events",
            label: "Commit-Author-Email-Mining (PushEvents)",
            workerKey: "github_events_public",
            targets: rootOnly,
            timeoutMs: 30_000,
        },
    ],
};

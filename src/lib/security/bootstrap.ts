// Phase-1+2+2.5+2.7 Bootstrap — wired beim App-Start.
//
//   - Phase 1:    ersetzt den NullAuthorizationResolver durch den entity-basierten.
//   - Phase 2:    registriert deklarierte Playbooks in der Playbook-Registry.
//   - Phase 2.5:  startet den Rule-Evaluator (abonniert den Event-Bus).
//   - Phase 2.7:  registriert OSINT-Identity-Playbooks (osint_email_passive).
//
// Wird einmalig aus `individual-routes.ts` aufgerufen (nach Express-Setup,
// vor erster Request).

import axios from "axios";
import { eq } from "drizzle-orm";
import { database } from "@/db";
import { rules } from "@/db/individual/individual-schema";
import { ruleService } from "./rules/rule.service";
import { setAuthorizationResolver } from "./authorization/authorization.service";
import { entityAuthorizationResolver } from "./authorization/entity-resolver";
import { registerPlaybook, getPlaybook } from "./playbooks/playbook-registry";
import { PLAYBOOK_KEYS } from "./playbooks/playbook-keys";
import { webReconPassivePlaybook } from "./playbooks/definitions/web-recon-passive";
import { webReconActivePlaybook } from "./playbooks/definitions/web-recon-active";
import { osintEmailPassivePlaybook } from "./playbooks/definitions/osint-email-passive";
import { osintUsernamePassivePlaybook } from "./playbooks/definitions/osint-username-passive";
import { osintOrganizationReconPlaybook } from "./playbooks/definitions/osint-organization-recon";
import { osintPivotLightPlaybook } from "./playbooks/definitions/osint-pivot-light";
import { osintGithubAccountReconPlaybook } from "./playbooks/definitions/osint-github-account-recon";
import { apiSecurityActivePlaybook } from "./playbooks/definitions/api-security-active";
import { startRuleEvaluator } from "./rules/rule-evaluator";
import { secuEventBus } from "./rules/event-bus";
import { registerSecuStreams, startSecuEventBridge } from "./realtime/secu-streams";
import { infrastructureProviderService } from "./osint/infrastructure-providers/provider.service";

let bootstrapped = false;

export function bootstrapSecurityDomain(): void {
    if (bootstrapped) return;
    setAuthorizationResolver(entityAuthorizationResolver);

    // Phase-2 Playbook-Definitionen.
    registerPlaybook(webReconPassivePlaybook);
    // Phase-3 Active-Safe-Variant (testssl + nmap + nuclei).
    registerPlaybook(webReconActivePlaybook);
    // Phase-2.7 OSINT-Identity-Playbooks.
    registerPlaybook(osintEmailPassivePlaybook);
    registerPlaybook(osintUsernamePassivePlaybook);
    registerPlaybook(osintOrganizationReconPlaybook);
    // Sprint 1.4 (OSINT-Engine, features.md §2.3) — Mini-Playbook für
    // Cross-Domain-Pivots. Wird vom Sprint-5-Cross-Domain-Worker via Rule
    // getriggert (parent=auslösender Run → hopDepth+1, blockt bei
    // engagements.osintMaxHops). Bis dahin: registriert + manuell via REST
    // startbar zur Triage einer einzelnen Domain.
    registerPlaybook(osintPivotLightPlaybook);
    // Sprint 3 (OSINT-Engine, features.md §3.3 #29b/c) — Mini-Playbook für
    // GitHub-Account-Anreicherung (Repos + Commit-Email-Mining). Wird auf
    // social_account-Root direkt aufgerufen — entweder manuell via REST oder
    // via Auto-Chain-Rule "GitHub-social_account → osint_github_account_recon".
    registerPlaybook(osintGithubAccountReconPlaybook);
    // Phase-4 API-Security-Playbook (getriggert wenn service_classify einen Host
    // als rest_api markiert — siehe seed-rule "service_classify rest_api → api_security_active").
    registerPlaybook(apiSecurityActivePlaybook);

    // Drift-Schutz: Jeder Key in PLAYBOOK_KEYS (Source-of-Truth fürs
    // Frontend-Enum) muss tatsächlich registriert sein. Wenn nicht, fail
    // fast — sonst weicht das Frontend-Enum vom Runtime-Stand ab.
    for (const key of PLAYBOOK_KEYS) {
        if (!getPlaybook(key)) {
            throw new Error(
                `[secu bootstrap] PLAYBOOK_KEYS contains "${key}" but no definition is registered. ` +
                `Register it in bootstrap.ts or remove it from playbook-keys.ts.`,
            );
        }
    }

    // Phase-2.5 Rule-Evaluator — abonniert Bus, evaluiert enabled rules.
    startRuleEvaluator();

    // Realtime-Layer: Topic-basierte WebSocket-Streams + EventBus → Stream-Bridge.
    // FE abonniert z.B. `secu:engagement:42` und bekommt alle Events live.
    registerSecuStreams();
    startSecuEventBridge();

    // Phase-2.7 — Cross-Engagement-Hit Direct-Listener.
    // Bewusst NICHT als DB-Rule, weil ruleTriggerEnum entity.cross_engagement_hit
    // (noch) nicht enthält — würde Schema-Migration brauchen. Direkter Listener
    // ist sauberer und liefert ohnehin operatorrelevante Realtime-Notifications.
    secuEventBus.on("entity.cross_engagement_hit", async (event) => {
        const url = process.env.BOSS_API_URL;
        if (!url) return;
        const message =
            `🎯 [secu] cross-engagement identity hit: ${event.displayName} ` +
            `(${event.kind}) — in Engagements ${event.engagementIds.join(", ")}`;
        try {
            await axios.post(url.replace(/\/$/, "") + "/notifications", {
                text: message,
                channel: "alerts",
                source: "node-secu",
                event,
            }, {
                headers: {
                    "x-app-id": "node-secu",
                    "x-api-key": process.env.BOSS_API_KEY ?? "",
                    "Content-Type": "application/json",
                },
                timeout: 5_000,
            });
        } catch (err) {
            console.warn("[secu] cross-engagement-hit notify failed:", (err as Error).message);
        }
    });

    // Sprint 1.4 — Auto-Chain-Rule für Cross-Domain-Pivots, vorerst DISABLED.
    // Wird in Sprint 5 (Cross-Domain-Pivot-Activation, features.md Sprint 5
    // Item #24) aktiviert, sobald `domain_html_pivots_extract` und der
    // `cross_domain_pivot_lookup`-Worker stehen. Bis dahin: registriert &
    // dokumentiert, damit der Operator sieht "diese Auto-Chain ist geplant".
    void ensureRule({
        name: "Cross-Domain Pivot → osint_pivot_light",
        description:
            "Sprint 1.4 (features.md §2.3) — Sobald ein Worker eine Domain via " +
            "Cross-Domain-Pivot (Tracking-ID-Match, Cert-SAN-Sharing, NS-Pair, " +
            "Impressum-Cross-Mention) entdeckt und als role=pivot anlegt, läuft " +
            "automatisch das Mini-Playbook osint_pivot_light gegen die neue Domain. " +
            "DISABLED bis Sprint 5: Cross-Domain-Discovery-Worker existieren noch nicht.",
        scope: "global",
        trigger: "entity.created",
        action: "start_playbook",
        condition: {
            and: [
                { "==": [{ var: "entity.kind" }, "asset_domain"] },
                { "==": [{ var: "entity.data.engagementRole" }, "pivot"] },
            ],
        },
        actionParams: {
            playbookKey: "osint_pivot_light",
            rootEntityIdFrom: "entity.id",
        },
        enabled: false,
    });

    // Sprint 3 — Auto-Chain für GitHub-social_account-Discoveries aus anderen
    // Workern (z.B. email_github_commits in osint_email_passive). Default
    // DISABLED: Operator schaltet bewusst frei, weil ein Hop-2 social_account
    // in mehrstufigen Engagements schnell viele Folge-Worker triggert. Wenn
    // domain_github_brand schon innerhalb von web_recon_passive den Account
    // gefunden hat, sind repos+events bereits dort als Folge-Steps verdrahtet
    // — diese Rule ist nur für Out-of-Band-Hits aus anderen Playbooks.
    void ensureRule({
        name: "GitHub-social_account → osint_github_account_recon",
        description:
            "Sprint 3 (features.md §3.3 #29b/c) — sobald aus anderen Quellen " +
            "(email_github_commits, manueller Operator-Add, Cross-Engagement-Pivot) " +
            "ein social_account mit data.platform='github' entsteht, läuft das " +
            "Mini-Playbook osint_github_account_recon (Repos + Commit-Email-Mining). " +
            "DEFAULT DISABLED — bewusste Operator-Entscheidung, weil Hop-2-Trigger " +
            "schnell die OSINT-Quota fressen.",
        scope: "global",
        trigger: "entity.created",
        action: "start_playbook",
        condition: {
            and: [
                { "==": [{ var: "entity.kind" }, "social_account"] },
                { "==": [{ var: "entity.data.platform" }, "github"] },
            ],
        },
        actionParams: {
            playbookKey: "osint_github_account_recon",
            rootEntityIdFrom: "entity.id",
        },
        enabled: false,
    });

    // Phase-4 — sicherstellen, dass die "service_classify rest_api → api_security_active"
    // Rule existiert. Idempotent (matcht via name); auf bestehenden DBs wird die Rule
    // dadurch beim ersten Start nach Deploy nachträglich angelegt.
    void ensureRule({
        name: "Service rest_api → api_security_active",
        description:
            "Phase 4 — sobald service_classify einen Host als rest_api markiert (entity.data." +
            "serviceType='rest_api'), startet die API-Security-Pipeline (OpenAPI-Discovery + " +
            "Auth-Probe + CORS-Check + Rate-Limit-Probe). Voraussetzung: Engagement hat " +
            "active_safe-Authorization auf dem Host.",
        scope: "global",
        trigger: "entity.updated",
        action: "start_playbook",
        condition: { "==": [{ var: "entity.data.serviceType" }, "rest_api"] },
        actionParams: {
            playbookKey: "api_security_active",
            rootEntityIdFrom: "entity.id",
        },
        enabled: true,
    });

    // Sprint 1.7 — Infrastructure-Provider-Cache vorwärmen (DB-Tabelle ist klein,
    // ~70 Zeilen). Wenn die DB beim Boot kurz weg ist, ist der Cache lazy-load
    // beim ersten Worker-Hit; der Pre-Load hier ist nur Hot-Path-Optimierung.
    void infrastructureProviderService
        .loadAll(true)
        .then((rows) => console.log(`[secu] infrastructure_providers cache primed (${rows.length} active entries)`))
        .catch((err) => console.warn("[secu] infrastructure_providers cache prime failed:", (err as Error).message));

    bootstrapped = true;
    console.log("✅ [secu] entity-based AuthorizationResolver active; playbooks=web_recon_{passive,active},osint_{email,username,organization},api_security_active; active workers=tls_deep,nuclei_safe,nmap_top1000,http_paths_probe,openapi_discovery,api_{auth_probe,cors_check,rate_limit_safe}; service_classify wired; rule-evaluator listening; cross-engagement-hit listener wired; infrastructure_provider registry primed.");
}

interface EnsureRuleInput {
    name: string;
    description: string;
    scope: string;
    trigger: "entity.created" | "entity.updated" | "finding.created" | "playbook_run.completed";
    action: "start_playbook" | "tag_entity" | "notify_boss";
    condition: Record<string, unknown> | null;
    actionParams: Record<string, unknown>;
    enabled: boolean;
}

async function ensureRule(input: EnsureRuleInput): Promise<void> {
    try {
        const [existing] = await database
            .select({ id: rules.id })
            .from(rules)
            .where(eq(rules.name, input.name))
            .limit(1);
        if (existing) return;
        await ruleService.create({
            ...input,
            createdBy: null,
        });
        console.log(`[secu] seeded rule: ${input.name}`);
    } catch (err) {
        console.warn(`[secu] ensureRule(${input.name}) failed:`, (err as Error).message);
    }
}

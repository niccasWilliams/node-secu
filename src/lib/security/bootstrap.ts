// Phase-1+2 Bootstrap — wired beim App-Start.
//
//   - Phase 1: ersetzt den NullAuthorizationResolver durch den entity-basierten.
//   - Phase 2: registriert deklarierte Playbooks in der Playbook-Registry.
//
// Wird einmalig aus `individual-routes.ts` aufgerufen (nach Express-Setup,
// vor erster Request).

import { setAuthorizationResolver } from "./authorization/authorization.service";
import { entityAuthorizationResolver } from "./authorization/entity-resolver";
import { registerPlaybook } from "./playbooks/playbook-registry";
import { webReconPassivePlaybook } from "./playbooks/definitions/web-recon-passive";

let bootstrapped = false;

export function bootstrapSecurityDomain(): void {
    if (bootstrapped) return;
    setAuthorizationResolver(entityAuthorizationResolver);

    // Phase-2 Playbook-Definitionen.
    registerPlaybook(webReconPassivePlaybook);

    bootstrapped = true;
    console.log("✅ [secu] entity-based AuthorizationResolver active; playbooks registered: web_recon_passive");
}

// Authorization-Service — entscheidet, ob ein Scan in der angegebenen Scope erlaubt ist.
//
// REGEL DES HAUSES:
// - passive_only: immer erlaubt (DNS, public TLS, HTTP-Header — kein Scan-Pattern).
// - active_safe: nur mit verified_ownership ODER own ODER written_consent ODER internal_lab.
// - active_intrusive: nur mit own ODER written_consent ODER internal_lab
//   (NIE bei verified_ownership allein — DNS-TXT-Proof reicht für Pentest nicht).
//
// Wir folgen §202c StGB strikt — lieber einen Scan blockieren als einen Vertrag riskieren.
//
// Phase 0: die Persistenz ist über AuthorizationResolver abstrahiert. Default-Resolver
// ist der NullAuthorizationResolver — passive geht durch, aktiv wird klar geblockt.
// Phase 1: ein entity-basierter Resolver wird über setAuthorizationResolver() injiziert.

import { nullAuthorizationResolver } from "./null-resolver";
import type {
    AuthorizationResolver,
    AuthorizationScope,
    AuthRecord,
    ScanTargetRef,
} from "./authorization.types";

export interface AuthorizationDecision {
    allowed: boolean;
    reason: string;
    authorization?: AuthRecord;
}

let activeResolver: AuthorizationResolver = nullAuthorizationResolver;

export function setAuthorizationResolver(resolver: AuthorizationResolver): void {
    activeResolver = resolver;
}

export function getAuthorizationResolver(): AuthorizationResolver {
    return activeResolver;
}

export const authorizationService = {
    /**
     * Prüft, ob ein Scan in der angegebenen Scope auf dem Target durchgeführt werden darf.
     */
    async canScan(target: ScanTargetRef, requiredScope: AuthorizationScope): Promise<AuthorizationDecision> {
        // passive_only ist Standard — niemals blockieren.
        if (requiredScope === "passive_only") {
            return { allowed: true, reason: "passive_only does not require explicit authorization" };
        }

        const owner = await activeResolver.resolveOwner(target);

        if (owner?.isOwnInfrastructure) {
            return { allowed: true, reason: "own_infrastructure" };
        }
        if (owner?.isInternalLab) {
            return { allowed: true, reason: "internal_lab" };
        }

        const auths = await activeResolver.getAuthorizations(target);
        if (auths.length === 0) {
            return {
                allowed: false,
                reason: activeResolver === nullAuthorizationResolver
                    ? "no authorization wired yet — phase 1 will provide entity-based resolver"
                    : "no_authorization_for_scope",
            };
        }

        const matchingScope = auths.filter((a) => scopeCovers(a.scope, requiredScope));
        const verified = matchingScope.find((a) => a.verifiedAt != null);

        if (verified) {
            // active_intrusive verlangt own/written_consent/internal_lab — KEINE simple verified_ownership.
            if (requiredScope === "active_intrusive" && verified.kind === "verified_ownership") {
                return {
                    allowed: false,
                    reason: "intrusive_scans_require_written_consent",
                };
            }
            return {
                allowed: true,
                reason: `authorized_via_${verified.kind}`,
                authorization: verified,
            };
        }

        if (matchingScope.length > 0) {
            return {
                allowed: false,
                reason: "authorization_pending_verification",
                authorization: matchingScope[0],
            };
        }

        return {
            allowed: false,
            reason: "no_authorization_for_scope",
        };
    },
};

function scopeCovers(granted: AuthorizationScope, required: AuthorizationScope): boolean {
    const order: AuthorizationScope[] = ["passive_only", "active_safe", "active_intrusive"];
    return order.indexOf(granted) >= order.indexOf(required);
}

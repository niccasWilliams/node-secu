// Authorization-Service — entscheidet, ob ein Scan-Type für ein Asset erlaubt ist.
//
// REGEL DES HAUSES:
// - passive_only: immer erlaubt (DNS, public TLS, HTTP-Header — kein Scan-Pattern).
// - active_safe: nur mit verified_ownership ODER own ODER written_consent.
// - active_intrusive: nur mit own ODER written_consent (NIE bei verified_ownership allein).
//
// Wir folgen §202c StGB strikt — lieber einen Scan blockieren als einen Vertrag riskieren.

import { database } from "@/db";
import { assets, assetAuthorizations, type Asset, type AssetAuthorization } from "@/db/individual/individual-schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { AuthorizationScope } from "../workers/worker.types";

export interface AuthorizationDecision {
    allowed: boolean;
    reason: string;
    authorization?: AssetAuthorization;
}

export const authorizationService = {
    /**
     * Prüft, ob ein Scan in der angegebenen Scope auf dem Asset durchgeführt werden darf.
     */
    async canScan(assetId: number, requiredScope: AuthorizationScope): Promise<AuthorizationDecision> {
        // passive_only ist Standard — niemals blockieren.
        if (requiredScope === "passive_only") {
            return { allowed: true, reason: "passive_only does not require explicit authorization" };
        }

        const asset = await database.query.assets.findFirst({ where: eq(assets.id, assetId) });
        if (!asset) {
            return { allowed: false, reason: `asset_${assetId}_not_found` };
        }

        // Eigene Infrastruktur: Niclas hat Eigentum, daher implizite Authorization für alles.
        if (asset.isOwnInfrastructure) {
            return { allowed: true, reason: "own_infrastructure" };
        }

        // Aktive Authorization in DB suchen
        const auths = await database
            .select()
            .from(assetAuthorizations)
            .where(and(
                eq(assetAuthorizations.assetId, assetId),
                isNull(assetAuthorizations.revokedAt),
                or(
                    isNull(assetAuthorizations.expiresAt),
                    gt(assetAuthorizations.expiresAt, new Date()),
                ),
            ));

        // Filter auf passende Scope
        const matchingScope = auths.filter((a) => scopeCovers(a.scope, requiredScope));

        // Mind. eine verified Authorization?
        const verified = matchingScope.find((a) => a.verifiedAt != null);
        if (verified) {
            // Zusätzliche Regel: active_intrusive verlangt own ODER written_consent — KEINE simple verified_ownership.
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

function scopeCovers(granted: string, required: AuthorizationScope): boolean {
    const order = ["passive_only", "active_safe", "active_intrusive"];
    return order.indexOf(granted) >= order.indexOf(required);
}

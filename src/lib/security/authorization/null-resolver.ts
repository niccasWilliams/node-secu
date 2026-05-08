// Phase-0-Stub: kein Persistenz-Backend für Authorization-Records.
//
// Wirkung in Kombination mit authorizationService.canScan():
//   - passive_only         → erlaubt (passive Scope ist niemals authorization-pflichtig)
//   - active_safe          → blockiert mit klarem Fehler
//   - active_intrusive     → blockiert mit klarem Fehler
//
// Phase 1 ersetzt diesen Stub durch einen entity-basierten Resolver.

import type { AuthorizationResolver, AuthRecord, OwnerInfo, ScanTargetRef } from "./authorization.types";

export const nullAuthorizationResolver: AuthorizationResolver = {
    async resolveOwner(_ref: ScanTargetRef): Promise<OwnerInfo | null> {
        return null;
    },
    async getAuthorizations(_ref: ScanTargetRef): Promise<AuthRecord[]> {
        return [];
    },
};

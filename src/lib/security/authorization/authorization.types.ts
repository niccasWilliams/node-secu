// Authorization-Layer Types & Resolver-Vertrag.
//
// Phase 0: die Persistenz-Schicht ist abgekoppelt. canScan() bekommt einen
// AuthorizationResolver injiziert, der Owner-Info + Auth-Records auf eine
// abstrakte Entity-Referenz beantwortet. Phase 1 implementiert den Resolver
// gegen die neuen `entities` + `entity_authorizations`-Tabellen — ohne dass
// die Scope-Logik in `authorization.service.ts` angefasst werden muss.

export type AuthorizationScope =
    | "passive_only"
    | "active_safe"
    | "active_intrusive";

export type AuthorizationKind =
    | "own"
    | "verified_ownership"
    | "written_consent"
    | "internal_lab";

/** Stabile Referenz auf das zu prüfende Objekt — Phase 0 generisch, Phase 1 typischerweise `kind: "entity"`. */
export interface ScanTargetRef {
    kind: string;
    id: string | number;
}

/** Eigentums-/Lab-Status des Targets. Wer ihn liefert, beweist damit "implizite" Authorization. */
export interface OwnerInfo {
    ownerUserId: number | null;
    /** Asset gehört dem Operator selbst (eigene Infra) → alle Scopes erlaubt. */
    isOwnInfrastructure: boolean;
    /** Asset ist Teil eines internen Lab/CTF → alle Scopes erlaubt. */
    isInternalLab?: boolean;
}

/** Persistenz-unabhängige Form eines Authorization-Records. */
export interface AuthRecord {
    id: number | string;
    kind: AuthorizationKind;
    scope: AuthorizationScope;
    verifiedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
}

export interface AuthorizationResolver {
    /** Liefert Owner-Info zum Target oder null wenn unbekannt. */
    resolveOwner(ref: ScanTargetRef): Promise<OwnerInfo | null>;
    /** Liefert alle nicht-revoked, nicht-abgelaufenen Authorization-Records für das Target. */
    getAuthorizations(ref: ScanTargetRef): Promise<AuthRecord[]>;
}

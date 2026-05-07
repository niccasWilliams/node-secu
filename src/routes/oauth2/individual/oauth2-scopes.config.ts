/**
 * OAuth2 Scopes Configuration (Individual)
 *
 * THIS FILE IS NOT SYNCED WITH THE TEMPLATE.
 * Customize it for each app to define app-specific OAuth2 scopes.
 *
 * The base oauth2-scopes.ts re-exports everything from this file
 * and adds utility functions (isValidScope, validateScopes, etc.).
 *
 * Example for node-bill:
 * ```typescript
 * export enum OAuth2Scope {
 *     INVOICES_READ = "invoices:read",
 *     INVOICES_WRITE = "invoices:write",
 *     INVOICES_DELETE = "invoices:delete",
 *     EXPENSES_READ = "expenses:read",
 *     // ...app-specific scopes
 *     ENTITLEMENTS_READ = "entitlements:read",
 *     ENTITLEMENTS_WRITE = "entitlements:write",
 * }
 * ```
 */

/**
 * Alle gueltigen OAuth2 Scopes als Enum
 */
export enum OAuth2Scope {

    // ============================================================================
    // ADMIN (Admin-Funktionen)
    // ============================================================================
    ADMIN_SETTINGS = "admin:settings", // App-Einstellungen aendern
    ADMIN_USERS = "admin:users", // User-Verwaltung

    // ============================================================================
    // ENTITLEMENTS (Berechtigungen/Entitlements) - Shop anbindung (NUR FUER SHOP)
    // ============================================================================
    ENTITLEMENTS_READ = "entitlements:read", // Berechtigungen lesen (z.B. fuer App-Entitlements)
    ENTITLEMENTS_WRITE = "entitlements:write", // Berechtigungen erstellen/aendern/loeschen (z.B. fuer App-Entitlements)

}

/**
 * Scope-Beschreibungen fuer UI
 */
export const SCOPE_DESCRIPTIONS: Record<OAuth2Scope, string> = {
    [OAuth2Scope.ADMIN_SETTINGS]: "App-Einstellungen verwalten",
    [OAuth2Scope.ADMIN_USERS]: "Benutzer verwalten",

    [OAuth2Scope.ENTITLEMENTS_READ]: "Berechtigungen lesen (Shop)",
    [OAuth2Scope.ENTITLEMENTS_WRITE]: "Berechtigungen verwalten (Shop)",
};

/**
 * Scope-Gruppen fuer UI (z.B. beim Erstellen eines Clients)
 */
export const SCOPE_GROUPS: Partial<Record<string, OAuth2Scope[]>> = {
    "Admin": [
        OAuth2Scope.ADMIN_SETTINGS,
        OAuth2Scope.ADMIN_USERS,
    ],
};

/**
 * OAuth2 Scopes Definition
 *
 * Re-exports app-specific scopes from individual config
 * and provides utility functions for scope validation.
 *
 * The actual scope enum, descriptions, and groups are defined in:
 * ./individual/oauth2-scopes.config.ts (NOT synced with template)
 *
 * Format: <resource>:<action>
 * - read: Lesen von Daten
 * - write: Erstellen/Bearbeiten (impliziert auch 'read')
 * - delete: Loeschen (OHNE automatisches 'read' oder 'write')
 *
 * Hierarchie:
 * - write umfasst NICHT automatisch delete (aus Sicherheitsgruenden)
 * - Aber: delete-Operationen benoetigen meist auch read (um zu pruefen, was geloescht wird)
 */

// Re-export everything from individual config
export { OAuth2Scope, SCOPE_DESCRIPTIONS, SCOPE_GROUPS } from "./individual/oauth2-scopes.config";

import { OAuth2Scope } from "./individual/oauth2-scopes.config";

/**
 * Type fuer Scope-Values
 */
export type OAuth2ScopeValue = `${OAuth2Scope}`;

/**
 * Alle gueltigen Scopes als Array
 */
export const ALL_OAUTH2_SCOPES = Object.values(OAuth2Scope);

/**
 * Prueft ob ein Scope-String gueltig ist
 */
export function isValidScope(scope: string): scope is OAuth2ScopeValue {
    return ALL_OAUTH2_SCOPES.includes(scope as OAuth2Scope);
}

/**
 * Validiert ein Array von Scopes (wirft Error bei ungueltigen)
 */
export function validateScopes(scopes: string[]): OAuth2ScopeValue[] {
    const invalid = scopes.filter(s => !isValidScope(s));

    if (invalid.length > 0) {
        throw new Error(
            `Invalid scope(s): ${invalid.join(", ")}. ` +
            `Valid scopes are: ${ALL_OAUTH2_SCOPES.join(", ")}`
        );
    }

    return scopes as OAuth2ScopeValue[];
}

/**
 * Prueft ob ein Benutzer/Client einen bestimmten Scope hat
 */
export function hasScope(grantedScopes: string[], requiredScope: OAuth2Scope): boolean {
    return grantedScopes.includes(requiredScope);
}

/**
 * Prueft ob ein Benutzer/Client ALLE angegebenen Scopes hat
 */
export function hasAllScopes(grantedScopes: string[], requiredScopes: OAuth2Scope[]): boolean {
    return requiredScopes.every(scope => grantedScopes.includes(scope));
}

/**
 * Prueft ob ein Benutzer/Client MINDESTENS EINEN der angegebenen Scopes hat
 */
export function hasAnyScope(grantedScopes: string[], requiredScopes: OAuth2Scope[]): boolean {
    return requiredScopes.some(scope => grantedScopes.includes(scope));
}

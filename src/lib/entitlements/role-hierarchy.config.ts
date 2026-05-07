/**
 * Role Hierarchy — Base Functions (synced with template)
 *
 * Generic functions for role hierarchy resolution.
 * The actual hierarchy data is defined in individual/role-hierarchy.config.ts.
 */
import { ROLE_HIERARCHY } from "./individual/role-hierarchy.config";

export { ROLE_HIERARCHY };

export function getImpliedRoles(roleName: string): string[] {
    return ROLE_HIERARCHY[roleName] ?? [];
}

export function getAllEffectiveRoles(roleNames: string[]): string[] {
    const effective = new Set(roleNames);
    for (const role of roleNames) {
        for (const implied of getImpliedRoles(role)) {
            effective.add(implied);
        }
    }
    return Array.from(effective);
}

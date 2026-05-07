/**
 * App-Specific Role Hierarchy Configuration
 * ==========================================
 * INDIVIDUAL FILE — NOT synced with template.
 *
 * Defines which roles implicitly include other roles.
 * "Enterprise Access" → also grants Premium + Base.
 *
 * This ensures that a user with a higher-tier plan can access
 * features gated behind lower-tier plans, even if the lower plan
 * is not explicitly assigned as a separate role_assignment.
 *
 * For a fresh app: leave ROLE_HIERARCHY empty.
 * Users only get explicitly assigned roles.
 *
 * Example:
 *
 *   export const ROLE_HIERARCHY: Record<string, string[]> = {
 *       "Premium Access": ["Base Access"],
 *       "Enterprise Access": ["Premium Access", "Base Access"],
 *   };
 */

// ── Define your role hierarchy here ─────────────────────────────────────────
// Empty = no implicit role inheritance.
export const ROLE_HIERARCHY: Record<string, string[]> = {};

/**
 * App-Specific Subscription Plan Configuration
 * ==============================================
 * INDIVIDUAL FILE — NOT synced with template.
 *
 * Define your plan tiers, which roles map to which plan,
 * and what limits each plan includes per metric.
 *
 * For a fresh app: leave APP_PLAN_PROFILES empty.
 * Users without a sellable plan get LEGACY_PLAN_LIMITS (default: unlimited).
 *
 * Example for a billing app:
 *
 *   export const APP_PLAN_PROFILES: PlanProfile[] = [
 *       {
 *           planCode: "base",
 *           priority: 10,
 *           roleNames: ["Base Access"],
 *           limits: { managing_companies: 1, document_storage_gb: 5 },
 *       },
 *       {
 *           planCode: "premium",
 *           priority: 20,
 *           roleNames: ["Premium Access"],
 *           limits: { managing_companies: 3, document_storage_gb: 50 },
 *       },
 *       {
 *           planCode: "enterprise",
 *           priority: 30,
 *           roleNames: ["Enterprise Access"],
 *           limits: { managing_companies: null, document_storage_gb: null },
 *       },
 *   ];
 *
 *   // null = unlimited (no cap on this metric)
 *   export const LEGACY_PLAN_LIMITS: MetricLimits = {
 *       managing_companies: null,
 *       document_storage_gb: null,
 *   };
 */

/** Limits per metric key. null = unlimited (no cap). */
export type MetricLimits = Record<string, number | null>;

export type PlanProfile = {
    /** Unique plan identifier (e.g., "base", "pro", "enterprise") */
    planCode: string;
    /** Higher priority wins when user has multiple plans */
    priority: number;
    /** Role names that map to this plan (case-insensitive match) */
    roleNames: string[];
    /** Per-metric limits for this plan */
    limits: MetricLimits;
};

// ── Define your plan tiers here ─────────────────────────────────────────────
// Empty = no plans, all users get legacy/unlimited access.
export const APP_PLAN_PROFILES: PlanProfile[] = [];

// ── Limits for users without a sellable plan ────────────────────────────────
// Default: empty = no limits = unlimited for legacy users.
export const LEGACY_PLAN_LIMITS: MetricLimits = {};

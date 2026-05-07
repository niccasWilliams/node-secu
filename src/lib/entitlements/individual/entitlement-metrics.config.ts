/**
 * App-Specific Metric Definitions
 * ================================
 * INDIVIDUAL FILE — NOT synced with template.
 *
 * Define what metrics this app supports for shop integration.
 * Each metric is either a "limit" (max users, storage) or "credit" (API calls, invoices).
 *
 * For a fresh app: leave APP_METRICS empty.
 * The entitlements system works with zero metrics (no overages, no limits, no manifest metrics).
 *
 * When ready to add metrics:
 * 1. Define your metrics in APP_METRICS below
 * 2. Implement measurement in individual/metric-measurement.service.ts
 * 3. Update individual/plan-limits.config.ts with per-plan limits
 *
 * Example for a billing app:
 *
 *   export const APP_METRICS: AppMetricDefinition[] = [
 *       {
 *           key: "managing_companies",
 *           type: "limit",
 *           unit: "Unternehmen",
 *           description: "Anzahl verwalteter Unternehmen (Mandanten)",
 *           suggestedPricing: { perUnit: 9.90, currency: "EUR" },
 *           suggestedTiers: [
 *               { tier: "starter", included: 1 },
 *               { tier: "professional", included: 5 },
 *           ],
 *           suggestedLimitBehavior: "pay_as_you_go",
 *           alertLabel: "Verwaltete Unternehmen",
 *       },
 *       {
 *           key: "invoices",
 *           type: "credit",
 *           unit: "Rechnungen",
 *           description: "Erstellbare Rechnungen (verbrauchbar)",
 *           suggestedPricing: { perUnit: 0.01, currency: "EUR" },
 *           suggestedPackages: [
 *               { name: "1.000 Rechnungen", amount: 1000, price: "10.00" },
 *           ],
 *           alertLabel: "Rechnungen",
 *       },
 *   ];
 */

export type AppMetricDefinition = {
    /** Unique metric key (e.g., "managing_companies", "api_calls", "storage_gb") */
    key: string;
    /** "limit" = hard/soft cap, "credit" = consumable pool */
    type: "limit" | "credit";
    /** Display unit (e.g., "Unternehmen", "GB", "calls") */
    unit: string;
    /** Human-readable description */
    description: string;
    /** Suggested pricing for shop configuration */
    suggestedPricing: { perUnit: number; currency: string };
    /** Suggested tier limits (for "limit" type) */
    suggestedTiers?: Array<{ tier: string; included: number }>;
    /** Suggested credit packages (for "credit" type) */
    suggestedPackages?: Array<{ name: string; amount: number; price: string }>;
    /** Suggested behavior when limit is reached */
    suggestedLimitBehavior?: "pay_as_you_go" | "hard_block" | "soft_warn";
    /** Label for usage alert emails (falls back to key if not set) */
    alertLabel?: string;
};

// ── Define your app's metrics here ──────────────────────────────────────────
// Empty = no metrics, entitlements system works without them.
export const APP_METRICS: AppMetricDefinition[] = [];

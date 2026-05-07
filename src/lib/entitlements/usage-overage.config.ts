/**
 * Usage Overage Defaults (synced with template)
 *
 * Generic defaults for the overage pull system.
 * App-specific metric pricing is defined via APP_METRICS in
 * individual/entitlement-metrics.config.ts and app_settings table.
 */

export const DEFAULT_OVERAGE_CURRENCY = "EUR";
export const DEFAULT_OVERAGE_PULL_DEFAULT_LOOKBACK_DAYS = 120;
export const DEFAULT_OVERAGE_PULL_MAX_EVENTS = 2000;
export const DEFAULT_OVERAGE_ENABLE_NEGATIVE_CORRECTIONS = true;

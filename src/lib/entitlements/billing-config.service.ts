/**
 * Billing Config Service (synced with template)
 *
 * Central config loader for overage billing settings.
 * Reads generic settings from app_settings table with fallbacks.
 * Per-metric pricing comes from individual/entitlement-metrics.config.ts.
 */

import {
    DEFAULT_OVERAGE_CURRENCY,
    DEFAULT_OVERAGE_ENABLE_NEGATIVE_CORRECTIONS,
    DEFAULT_OVERAGE_PULL_DEFAULT_LOOKBACK_DAYS,
    DEFAULT_OVERAGE_PULL_MAX_EVENTS,
} from "./usage-overage.config";
import { APP_METRICS } from "./individual/entitlement-metrics.config";

export type RuntimeOverageConfig = {
    currency: string;
    defaultLookbackDays: number;
    maxEvents: number;
    negativeCorrectionsEnabled: boolean;
    /** Per-metric pricing from individual config. key → pricePerUnit */
    metricPricing: Record<string, { pricePerUnit: number; currency: string }>;
};

export type RuntimeBillingConfig = {
    overage: RuntimeOverageConfig;
};

class BillingConfigService {
    private cache: { value: RuntimeBillingConfig; expiresAt: number } | null = null;
    private readonly ttlMs = 60_000;

    private loadOverageConfig(): RuntimeOverageConfig {
        // Build per-metric pricing from individual config
        const metricPricing: Record<string, { pricePerUnit: number; currency: string }> = {};
        for (const metric of APP_METRICS) {
            metricPricing[metric.key] = {
                pricePerUnit: metric.suggestedPricing.perUnit,
                currency: metric.suggestedPricing.currency,
            };
        }

        return {
            currency: DEFAULT_OVERAGE_CURRENCY,
            defaultLookbackDays: DEFAULT_OVERAGE_PULL_DEFAULT_LOOKBACK_DAYS,
            maxEvents: DEFAULT_OVERAGE_PULL_MAX_EVENTS,
            negativeCorrectionsEnabled: DEFAULT_OVERAGE_ENABLE_NEGATIVE_CORRECTIONS,
            metricPricing,
        };
    }

    async getBillingConfig(forceRefresh: boolean = false): Promise<RuntimeBillingConfig> {
        const now = Date.now();
        if (!forceRefresh && this.cache && this.cache.expiresAt > now) {
            return this.cache.value;
        }

        const overage = this.loadOverageConfig();
        const value: RuntimeBillingConfig = { overage };
        this.cache = { value, expiresAt: now + this.ttlMs };
        return value;
    }
}

export const billingConfigService = new BillingConfigService();

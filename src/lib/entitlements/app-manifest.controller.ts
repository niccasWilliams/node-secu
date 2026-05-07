/**
 * App Manifest Controller
 *
 * Returns a self-describing manifest of what this app offers:
 * metrics, pricing suggestions, tiers, credit packages, webhooks, capabilities.
 * The shop reads this to know what products/limits/credits can be configured.
 *
 * Reads metric definitions from individual/entitlement-metrics.config.ts.
 * For a fresh app with no metrics: returns empty metrics object — valid response.
 */

import { Request, Response } from "express";
import { APP_ID } from "@/app.config";
import { APP_METRICS, AppMetricDefinition } from "./individual/entitlement-metrics.config";

type ManifestMetricDefinition = {
    type: "limit" | "credit";
    unit: string;
    description: string;
    suggestedPricing: { perUnit: string; currency: string };
    suggestedTiers?: Array<{ tier: string; included: number }>;
    suggestedPackages?: Array<{ name: string; amount: number; price: string }>;
    suggestedLimitBehavior?: string;
};

function metricToManifest(metric: AppMetricDefinition): ManifestMetricDefinition {
    const result: ManifestMetricDefinition = {
        type: metric.type,
        unit: metric.unit,
        description: metric.description,
        suggestedPricing: {
            perUnit: metric.suggestedPricing.perUnit.toFixed(2),
            currency: metric.suggestedPricing.currency,
        },
    };
    if (metric.suggestedTiers) result.suggestedTiers = metric.suggestedTiers;
    if (metric.suggestedPackages) result.suggestedPackages = metric.suggestedPackages;
    if (metric.suggestedLimitBehavior) result.suggestedLimitBehavior = metric.suggestedLimitBehavior;
    return result;
}

class AppManifestController {
    async getManifest(_req: Request, res: Response) {
        try {
            const metrics: Record<string, ManifestMetricDefinition> = {};
            for (const metric of APP_METRICS) {
                metrics[metric.key] = metricToManifest(metric);
            }

            // Determine capabilities based on what the app has configured
            const capabilities: string[] = ["entitlements"];
            if (APP_METRICS.length > 0) {
                capabilities.push("usage-reporting");
            }
            // Credit-related capabilities only if app has credit-type metrics
            if (APP_METRICS.some((m) => m.type === "credit")) {
                capabilities.push("credit-consumption", "credit-sync");
            }

            const manifest = {
                appId: APP_ID,
                version: "1.0",
                metrics,
                webhooks: ["credit-update", "usage-alerts"],
                capabilities,
            };

            return res.status(200).json(manifest);
        } catch (error) {
            console.error("[AppManifestController] Error building manifest:", error);
            return res.status(500).json({ message: "Failed to build app manifest" });
        }
    }
}

export const appManifestController = new AppManifestController();

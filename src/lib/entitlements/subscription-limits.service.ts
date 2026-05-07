/**
 * Subscription Limits Service (synced with template)
 *
 * Generic service that resolves effective limits and usage for a user based on
 * their assigned roles and the plan configuration from individual/plan-limits.config.ts.
 * Delegates metric measurement to individual/metric-measurement.service.ts.
 *
 * Returns generic Record<string, ...> structures — no hardcoded metric names.
 */

import { database } from "@/db";
import { UserId } from "@/db/schema";
import { roleService } from "@/routes/auth/roles/roles/role.service";
import { APP_PLAN_PROFILES, LEGACY_PLAN_LIMITS, type MetricLimits } from "./individual/plan-limits.config";
import { measureMetricsForUser } from "./individual/metric-measurement.service";

export type EffectiveSubscriptionLimits = {
    planCode: string;
    sourceRoles: string[];
    limits: MetricLimits;
};

export type MetricUsage = {
    used: number;
    limit: number | null;
    remaining: number | null;
    canUse: boolean;
};

export type EffectiveSubscriptionUsage = {
    planCode: string;
    sourceRoles: string[];
    metrics: Record<string, MetricUsage>;
};

function normalizeRoleName(name: string): string {
    return String(name || "").trim().toLowerCase();
}

/**
 * Generic addon convention (no migration required):
 * - "addon:{metricKey}:+N"       → add N to current limit
 * - "addon:{metricKey}:unlimited" → remove limit (set to null)
 */
function parseAddon(roleName: string): { metricKey: string; value: number | "unlimited" } | null {
    const normalized = normalizeRoleName(roleName);
    const match = normalized.match(/^addon:([^:]+):(.+)$/);
    if (!match) return null;

    const metricKey = match[1];
    const rawValue = match[2];

    if (rawValue === "unlimited") return { metricKey, value: "unlimited" };

    const plusMatch = rawValue.match(/^\+(\d+)$/);
    if (!plusMatch) return null;

    const n = Number(plusMatch[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { metricKey, value: n };
}


class SubscriptionLimitsService {
    /**
     * Returns the effective limits for a user based on their highest-priority
     * sellable plan role + any addon roles.
     *
     * If no plan profiles are configured (fresh app), returns legacy limits (default: unlimited).
     */
    async getEffectiveLimitsForUser(userId: UserId, trx = database): Promise<EffectiveSubscriptionLimits> {
        const activeRoles = await roleService.getActiveUserRolesWithHierarchy(userId, trx);
        const roleNames = activeRoles.map((r) => r.name);

        // Find highest-priority sellable plan
        let chosenPlan: (typeof APP_PLAN_PROFILES)[number] | null = null;
        for (const role of activeRoles) {
            if (!role.isSellable) continue;
            const normalized = normalizeRoleName(role.name);
            const candidate = APP_PLAN_PROFILES.find((p) =>
                p.roleNames.some((rn) => normalizeRoleName(rn) === normalized)
            );
            if (!candidate) continue;
            if (!chosenPlan || candidate.priority > chosenPlan.priority) {
                chosenPlan = candidate;
            }
        }

        // Start with plan limits or legacy defaults
        const baseLimits: MetricLimits = chosenPlan
            ? { ...chosenPlan.limits }
            : { ...LEGACY_PLAN_LIMITS };
        const planCode = chosenPlan?.planCode ?? "legacy";

        // Apply addon roles
        for (const roleName of roleNames) {
            const addon = parseAddon(roleName);
            if (!addon) continue;

            if (addon.value === "unlimited") {
                baseLimits[addon.metricKey] = null;
            } else if (baseLimits[addon.metricKey] !== undefined && baseLimits[addon.metricKey] !== null) {
                baseLimits[addon.metricKey] = (baseLimits[addon.metricKey] as number) + addon.value;
            }
        }

        return {
            planCode,
            sourceRoles: roleNames,
            limits: baseLimits,
        };
    }

    /**
     * Returns effective usage for a user — limits + measured values + remaining capacity.
     * Delegates measurement to individual/metric-measurement.service.ts.
     */
    async getUsageForUser(userId: UserId, trx = database): Promise<EffectiveSubscriptionUsage> {
        const effectiveLimits = await this.getEffectiveLimitsForUser(userId, trx);
        const measured = await measureMetricsForUser(userId);

        const metrics: Record<string, MetricUsage> = {};

        for (const [key, limit] of Object.entries(effectiveLimits.limits)) {
            const used = measured[key] ?? 0;
            metrics[key] = {
                used,
                limit,
                remaining: limit === null ? null : Math.max(0, limit - used),
                canUse: limit === null ? true : used < limit,
            };
        }

        // Also include measured metrics that aren't in limits (informational)
        for (const [key, value] of Object.entries(measured)) {
            if (metrics[key]) continue;
            metrics[key] = {
                used: value,
                limit: null,
                remaining: null,
                canUse: true,
            };
        }

        return {
            planCode: effectiveLimits.planCode,
            sourceRoles: effectiveLimits.sourceRoles,
            metrics,
        };
    }

    /**
     * Generic limit assertion — throws if a specific metric has reached its limit.
     * Apps can call this for any metric key defined in their plan config.
     */
    async assertCanUseMetric(userId: UserId, metricKey: string, trx = database): Promise<void> {
        const usage = await this.getUsageForUser(userId, trx);
        const metric = usage.metrics[metricKey];
        if (metric && !metric.canUse) {
            throw new Error(
                `Plan-Limit erreicht: ${metricKey} (aktuell ${metric.used}` +
                `${metric.limit !== null ? ` / max ${metric.limit}` : ""}).`
            );
        }
    }
}

export const subscriptionLimitsService = new SubscriptionLimitsService();

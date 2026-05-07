/**
 * Subscription Plan Limits — Base Re-exports (synced with template)
 *
 * Types and data re-exported from individual/plan-limits.config.ts.
 * This file exists for backward compatibility with services that import from here.
 */
import {
    APP_PLAN_PROFILES,
    LEGACY_PLAN_LIMITS,
    type MetricLimits,
    type PlanProfile,
} from "./individual/plan-limits.config";

// Re-export individual types for services
export type SubscriptionPlanCode = string;
export type SubscriptionPlanLimits = MetricLimits;
export type SubscriptionPlanProfile = PlanProfile;

export const DEFAULT_SUBSCRIPTION_PLAN_PROFILES = APP_PLAN_PROFILES;
export const DEFAULT_LEGACY_PLAN_LIMITS = LEGACY_PLAN_LIMITS;

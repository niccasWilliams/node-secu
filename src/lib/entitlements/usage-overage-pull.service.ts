/**
 * Usage Overage Pull Service (synced with template)
 *
 * Generic service that generates deterministic overage events for shop billing.
 * Reads metric definitions from individual/entitlement-metrics.config.ts.
 * Delegates measurement to individual/metric-measurement.service.ts.
 *
 * For a fresh app with no metrics: returns empty events array (no overages).
 */

import crypto from "crypto";
import { APP_ID } from "@/app.config";
import { database } from "@/db";
import {
    entitlementSyncLinks,
    EntitlementSyncType,
    usageOverageEvents,
} from "@/db/schema";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { nowInBerlin } from "@/util/utils";
import { subscriptionLimitsService } from "./subscription-limits.service";
import { billingConfigService, type RuntimeOverageConfig } from "./billing-config.service";
import { APP_METRICS } from "./individual/entitlement-metrics.config";
import { measureMetricsForUser } from "./individual/metric-measurement.service";

export type UsageOveragePullEvent = {
    externalEventId: string;
    externalUserId: string;
    shopAssignmentId: number | string | null;
    externalIdentifier: string;
    entitlementType: "role" | "area";
    metricKey: string;
    unit: string;
    periodStart: string;
    periodEnd: string;
    occurredAt: string;
    includedQuantity: number;
    usedQuantity: number;
    overageQuantity: number;
    overageAmount: number;
    currency: string;
    note: string | null;
    pricingPayload: Record<string, unknown>;
    context: { shopAssignmentId: number | string | null } | null;
};

export type GetUsageOveragesInput = {
    since?: Date;
    periodStart?: Date;
    periodEnd?: Date;
    limit?: number;
};

type MetricSnapshot = {
    metricKey: string;
    unit: string;
    includedQuantity: number;
    usedQuantity: number;
    cumulativeOverageQuantity: number;
    pricePerUnitEur: number;
    cumulativeOverageAmount: number;
    baseNote: string;
};

function toNumber(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

function round(value: number, digits: number = 6): number {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function abs(value: number): number {
    return value < 0 ? -value : value;
}

function isNearlyZero(value: number, epsilon: number = 0.000001): boolean {
    return abs(value) <= epsilon;
}

function normalizeText(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function normalizeRoleName(name: string): string {
    return String(name || "").trim().toLowerCase();
}

function monthStartUtc(reference: Date): Date {
    return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0));
}

function monthEndUtc(reference: Date): Date {
    return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0) - 1);
}

function parseShopAssignmentId(value: string | null): number | string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isSafeInteger(n) && String(n) === trimmed) return n;
    return trimmed;
}

class UsageOveragePullService {
    private buildFingerprint(input: {
        externalUserId: string;
        externalIdentifier: string;
        entitlementType: EntitlementSyncType;
        shopAssignmentId: string | null;
        metricKey: string;
        periodStart: Date;
        periodEnd: Date;
        includedQuantity: number;
        usedQuantity: number;
        cumulativeOverageQuantity: number;
        cumulativeOverageAmount: number;
        reportedOverageQuantity: number;
        reportedOverageAmount: number;
        deltaOverageQuantity: number;
        deltaOverageAmount: number;
        pricePerUnitEur: number;
    }): string {
        return [
            APP_ID,
            input.externalUserId,
            input.externalIdentifier,
            input.entitlementType,
            input.shopAssignmentId ?? "",
            input.metricKey,
            input.periodStart.toISOString(),
            input.periodEnd.toISOString(),
            round(input.includedQuantity).toFixed(6),
            round(input.usedQuantity).toFixed(6),
            round(input.cumulativeOverageQuantity).toFixed(6),
            round(input.cumulativeOverageAmount).toFixed(6),
            round(input.reportedOverageQuantity).toFixed(6),
            round(input.reportedOverageAmount).toFixed(6),
            round(input.deltaOverageQuantity).toFixed(6),
            round(input.deltaOverageAmount).toFixed(6),
            round(input.pricePerUnitEur).toFixed(6),
        ].join("|");
    }

    private buildExternalEventId(fingerprint: string): string {
        const hash = crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 48);
        return `evt_${APP_ID.toLowerCase()}_${hash}`;
    }

    private pickPrimaryLink(
        links: Array<typeof entitlementSyncLinks.$inferSelect>,
        sourceRoles: string[]
    ): (typeof entitlementSyncLinks.$inferSelect) | null {
        if (links.length === 0) return null;
        const normalizedSourceRoles = new Set(sourceRoles.map(normalizeRoleName));

        const matching = links.filter((link) =>
            normalizedSourceRoles.has(normalizeRoleName(link.externalIdentifier))
        );
        const pick = (items: Array<typeof entitlementSyncLinks.$inferSelect>) =>
            items.find((item) => normalizeText(item.shopAssignmentId) !== null) ?? items[0] ?? null;

        return pick(matching) ?? pick(links);
    }

    private async getAlreadyReportedTotals(input: {
        externalUserId: string;
        externalIdentifier: string;
        entitlementType: EntitlementSyncType;
        shopAssignmentId: string | null;
        metricKey: string;
        periodStart: Date;
        periodEnd: Date;
    }): Promise<{ overageQuantity: number; overageAmount: number }> {
        const where = [
            eq(usageOverageEvents.externalUserId, input.externalUserId),
            eq(usageOverageEvents.externalIdentifier, input.externalIdentifier),
            eq(usageOverageEvents.entitlementType, input.entitlementType),
            eq(usageOverageEvents.metricKey, input.metricKey),
            eq(usageOverageEvents.periodStart, input.periodStart),
            eq(usageOverageEvents.periodEnd, input.periodEnd),
            input.shopAssignmentId
                ? eq(usageOverageEvents.shopAssignmentId, input.shopAssignmentId)
                : isNull(usageOverageEvents.shopAssignmentId),
        ];

        const [row] = await database
            .select({
                totalQuantity: sql<string>`coalesce(sum(${usageOverageEvents.overageQuantity}), 0)`,
                totalAmount: sql<string>`coalesce(sum(${usageOverageEvents.overageAmount}), 0)`,
            })
            .from(usageOverageEvents)
            .where(and(...where));

        return {
            overageQuantity: round(toNumber(row?.totalQuantity), 6),
            overageAmount: round(toNumber(row?.totalAmount), 6),
        };
    }

    /**
     * Build metric snapshots from measured usage vs plan limits.
     * Generic: iterates over APP_METRICS, uses measured values + plan limits.
     */
    private buildMetricSnapshots(input: {
        limits: Record<string, number | null>;
        measured: Record<string, number>;
        overageConfig: RuntimeOverageConfig;
    }): MetricSnapshot[] {
        const snapshots: MetricSnapshot[] = [];

        for (const metric of APP_METRICS) {
            const limit = input.limits[metric.key];
            // null = unlimited, skip. undefined = not in plan, skip.
            if (limit === null || limit === undefined) continue;

            const used = round(input.measured[metric.key] ?? 0, 6);
            const included = round(limit, 6);
            const cumulativeOverageQuantity = round(Math.max(0, used - included), 6);

            const pricing = input.overageConfig.metricPricing[metric.key];
            const pricePerUnitEur = round(pricing?.pricePerUnit ?? 0, 6);
            const cumulativeOverageAmount = round(cumulativeOverageQuantity * pricePerUnitEur, 6);

            snapshots.push({
                metricKey: metric.key,
                unit: metric.unit,
                includedQuantity: included,
                usedQuantity: used,
                cumulativeOverageQuantity,
                pricePerUnitEur,
                cumulativeOverageAmount,
                baseNote: `${metric.description} limit overage`,
            });
        }

        return snapshots;
    }

    private async ensureEventsForPeriod(
        periodStart: Date,
        periodEnd: Date,
        overageConfig: RuntimeOverageConfig
    ): Promise<void> {
        // No metrics configured = nothing to report
        if (APP_METRICS.length === 0) return;

        const now = nowInBerlin();

        const links = await database
            .select()
            .from(entitlementSyncLinks)
            .where(
                and(
                    eq(entitlementSyncLinks.isActive, true),
                    eq(entitlementSyncLinks.entitlementType, "role"),
                    isNotNull(entitlementSyncLinks.userId)
                )
            )
            .orderBy(desc(entitlementSyncLinks.updatedAt), desc(entitlementSyncLinks.id));

        const linksByUserId = new Map<number, Array<typeof entitlementSyncLinks.$inferSelect>>();
        for (const link of links) {
            if (link.userId == null) continue;
            const userLinks = linksByUserId.get(link.userId) ?? [];
            userLinks.push(link);
            linksByUserId.set(link.userId, userLinks);
        }

        for (const [userId, userLinks] of linksByUserId.entries()) {
            const externalUserId = normalizeText(userLinks[0]?.externalUserId);
            if (!externalUserId) continue;

            const effectiveLimits = await subscriptionLimitsService.getEffectiveLimitsForUser(userId, database);
            const measured = await measureMetricsForUser(userId);

            const primaryLink = this.pickPrimaryLink(userLinks, effectiveLimits.sourceRoles);
            const externalIdentifier = primaryLink?.externalIdentifier ?? effectiveLimits.sourceRoles[0] ?? "unknown";
            const entitlementType: EntitlementSyncType = primaryLink?.entitlementType ?? "role";
            const shopAssignmentId = normalizeText(primaryLink?.shopAssignmentId);

            const metricSnapshots = this.buildMetricSnapshots({
                limits: effectiveLimits.limits,
                measured,
                overageConfig,
            });

            for (const metric of metricSnapshots) {
                const reported = await this.getAlreadyReportedTotals({
                    externalUserId,
                    externalIdentifier,
                    entitlementType,
                    shopAssignmentId,
                    metricKey: metric.metricKey,
                    periodStart,
                    periodEnd,
                });

                let deltaOverageQuantity = round(
                    metric.cumulativeOverageQuantity - reported.overageQuantity,
                    6
                );
                let deltaOverageAmount = round(
                    metric.cumulativeOverageAmount - reported.overageAmount,
                    6
                );

                if (!overageConfig.negativeCorrectionsEnabled && (deltaOverageQuantity < 0 || deltaOverageAmount < 0)) {
                    deltaOverageQuantity = Math.max(0, deltaOverageQuantity);
                    deltaOverageAmount = Math.max(0, deltaOverageAmount);
                }

                if (isNearlyZero(deltaOverageQuantity) && isNearlyZero(deltaOverageAmount)) continue;

                const direction = deltaOverageAmount < 0 || deltaOverageQuantity < 0 ? "decrease" : "increase";
                const fingerprint = this.buildFingerprint({
                    externalUserId,
                    externalIdentifier,
                    entitlementType,
                    shopAssignmentId,
                    metricKey: metric.metricKey,
                    periodStart,
                    periodEnd,
                    includedQuantity: metric.includedQuantity,
                    usedQuantity: metric.usedQuantity,
                    cumulativeOverageQuantity: metric.cumulativeOverageQuantity,
                    cumulativeOverageAmount: metric.cumulativeOverageAmount,
                    reportedOverageQuantity: reported.overageQuantity,
                    reportedOverageAmount: reported.overageAmount,
                    deltaOverageQuantity,
                    deltaOverageAmount,
                    pricePerUnitEur: metric.pricePerUnitEur,
                });
                const externalEventId = this.buildExternalEventId(fingerprint);

                await database
                    .insert(usageOverageEvents)
                    .values({
                        externalEventId,
                        sourceFingerprint: fingerprint,
                        externalUserId,
                        shopAssignmentId,
                        externalIdentifier,
                        entitlementType,
                        metricKey: metric.metricKey,
                        unit: metric.unit,
                        periodStart,
                        periodEnd,
                        occurredAt: now,
                        includedQuantity: metric.includedQuantity.toFixed(6),
                        usedQuantity: metric.usedQuantity.toFixed(6),
                        overageQuantity: deltaOverageQuantity.toFixed(6),
                        overageAmount: deltaOverageAmount.toFixed(6),
                        currency: overageConfig.currency,
                        note: `${metric.baseNote} (${direction} reconciliation)`,
                        pricingPayload: {
                            model: "flat",
                            pricePerUnit: metric.pricePerUnitEur,
                            reconciliation: {
                                enabled: true,
                                direction,
                                cumulativeOverageQuantity: metric.cumulativeOverageQuantity,
                                cumulativeOverageAmount: metric.cumulativeOverageAmount,
                                reportedOverageQuantity: reported.overageQuantity,
                                reportedOverageAmount: reported.overageAmount,
                                deltaOverageQuantity,
                                deltaOverageAmount,
                            },
                        },
                        createdAt: now,
                        updatedAt: now,
                    })
                    .onConflictDoNothing({ target: usageOverageEvents.externalEventId });
            }
        }
    }

    async getUsageOverageEvents(input: GetUsageOveragesInput = {}): Promise<UsageOveragePullEvent[]> {
        const billingConfig = await billingConfigService.getBillingConfig();
        const overageConfig = billingConfig.overage;
        const now = nowInBerlin();
        const periodStart = input.periodStart ?? monthStartUtc(now);
        const periodEnd = input.periodEnd ?? monthEndUtc(now);
        const limit = Math.min(
            overageConfig.maxEvents,
            Math.max(1, Math.floor(input.limit ?? overageConfig.maxEvents))
        );
        const since =
            input.since ??
            new Date(now.getTime() - overageConfig.defaultLookbackDays * 24 * 60 * 60 * 1000);

        await this.ensureEventsForPeriod(periodStart, periodEnd, overageConfig);

        const conditions = [gte(usageOverageEvents.occurredAt, since)];

        if (input.periodStart) conditions.push(eq(usageOverageEvents.periodStart, periodStart));
        if (input.periodEnd) conditions.push(eq(usageOverageEvents.periodEnd, periodEnd));

        const rows = await database
            .select()
            .from(usageOverageEvents)
            .where(and(...conditions))
            .orderBy(desc(usageOverageEvents.occurredAt), desc(usageOverageEvents.id))
            .limit(limit);

        return rows.map((row) => {
            const shopAssignmentId = parseShopAssignmentId(row.shopAssignmentId ?? null);
            const pricingPayload =
                row.pricingPayload && typeof row.pricingPayload === "object"
                    ? (row.pricingPayload as Record<string, unknown>)
                    : {};

            return {
                externalEventId: row.externalEventId,
                externalUserId: row.externalUserId,
                shopAssignmentId,
                externalIdentifier: row.externalIdentifier,
                entitlementType: row.entitlementType,
                metricKey: row.metricKey,
                unit: row.unit,
                periodStart: row.periodStart.toISOString(),
                periodEnd: row.periodEnd.toISOString(),
                occurredAt: row.occurredAt.toISOString(),
                includedQuantity: toNumber(row.includedQuantity),
                usedQuantity: toNumber(row.usedQuantity),
                overageQuantity: toNumber(row.overageQuantity),
                overageAmount: toNumber(row.overageAmount),
                currency: row.currency,
                note: row.note ?? null,
                pricingPayload,
                context: shopAssignmentId === null ? null : { shopAssignmentId },
            };
        });
    }
}

export const usageOveragePullService = new UsageOveragePullService();

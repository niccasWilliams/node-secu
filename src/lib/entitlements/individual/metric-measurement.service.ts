/**
 * App-Specific Metric Measurement
 * ================================
 * INDIVIDUAL FILE — NOT synced with template.
 *
 * Implement how your app measures its metrics for a given user.
 * Called by the usage-overage-pull service to calculate overages.
 *
 * For a fresh app: return empty object (no metrics to measure).
 *
 * Example for a billing app:
 *
 *   import { database } from "@/db";
 *   import { managingCompanies } from "@/db/individual/individual-schema";
 *   import { eq, sql } from "drizzle-orm";
 *
 *   export async function measureMetricsForUser(userId: number): Promise<Record<string, number>> {
 *       const [companyCount] = await database
 *           .select({ count: sql<number>`count(*)` })
 *           .from(managingCompanies)
 *           .where(eq(managingCompanies.adminUserId, userId));
 *
 *       return {
 *           managing_companies: Number(companyCount?.count ?? 0),
 *           document_storage_gb: await measureStorageGb(userId),
 *       };
 *   }
 */

// ── Implement your metric measurements here ─────────────────────────────────
// Return a Record mapping metric keys to their current measured values.
// Only metrics defined in entitlement-metrics.config.ts will be used.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function measureMetricsForUser(_userId: number): Promise<Record<string, number>> {
    // Fresh app: no metrics to measure
    return {};
}

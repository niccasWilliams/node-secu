import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { database } from "@/db";
import { UserActivity, userActivities, UserId } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { DateTime } from "luxon";

interface RequestDetail {
    timestamp: string;
    endpoint: string;
    method: string;
    statusCode?: number;
    error?: string;
    userAgent?: string;
    ipAddress?: string;
}

class UserActivityService {

    /**
     * Track daily user activity (one entry per user per day)
     * Updates existing entry or creates new one
     * @param userId Internal user ID
     * @param endpoint Endpoint accessed
     * @param method HTTP method
     * @param statusCode HTTP status code
     * @param error Error message if request failed
     * @param userAgent User agent string
     * @param ipAddress IP address
     */
    async trackDailyActivity(
        userId: UserId,
        endpoint: string,
        method: string,
        statusCode?: number,
        error?: string,
        userAgent?: string,
        ipAddress?: string,
        trx = database
    ): Promise<UserActivity> {
        try {
            const now = nowInBerlin();
            const today = DateTime.fromJSDate(now).toISODate()!; // YYYY-MM-DD format (non-null assertion)

            const requestDetail: RequestDetail = {
                timestamp: now.toISOString(),
                endpoint,
                method,
                statusCode,
                error,
                userAgent,
                ipAddress,
            };

            // Use PostgreSQL upsert (ON CONFLICT DO UPDATE)
            const result = await trx
                .insert(userActivities)
                .values({
                    userId,
                    activityDate: today,
                    firstActivityAt: now,
                    lastActivityAt: now,
                    requestCount: 1,
                    requests: [requestDetail],
                    createdAt: now,
                    updatedAt: now,
                })
                .onConflictDoUpdate({
                    target: [userActivities.userId, userActivities.activityDate],
                    set: {
                        lastActivityAt: now,
                        requestCount: sql`${userActivities.requestCount} + 1`,
                        // Keep only last 50 requests (FIFO) - remove oldest when exceeding 50
                        requests: sql`
                            CASE
                                WHEN jsonb_array_length(${userActivities.requests}) >= 50
                                THEN (
                                    SELECT jsonb_agg(elem)
                                    FROM (
                                        SELECT elem
                                        FROM jsonb_array_elements(${userActivities.requests}) elem
                                        OFFSET 1
                                    ) subq
                                ) || ${JSON.stringify(requestDetail)}::jsonb
                                ELSE ${userActivities.requests} || ${JSON.stringify(requestDetail)}::jsonb
                            END
                        `,
                        updatedAt: now,
                    },
                })
                .returning();

            return result[0];
        } catch (error) {
            console.error("Error tracking daily activity:", error);
            throw new Error("Error tracking daily activity");
        }
    }

    /**
     * Get user's last activity timestamp
     * @param userId Internal user ID
     */
    async getLastActivity(userId: UserId, trx = database): Promise<Date | null> {
        try {
            const result = await trx
                .select({ lastActivityAt: userActivities.lastActivityAt })
                .from(userActivities)
                .where(eq(userActivities.userId, userId))
                .orderBy(desc(userActivities.activityDate))
                .limit(1);

            return result.length > 0 ? result[0].lastActivityAt : null;
        } catch (error) {
            console.error("Error getting last activity:", error);
            throw new Error("Error getting last activity");
        }
    }

    /**
     * Get user daily activities within a date range
     * @param userId Internal user ID
     * @param startDate Start date (YYYY-MM-DD)
     * @param endDate End date (YYYY-MM-DD)
     */
    async getUserActivitiesInRange(
        userId: UserId,
        startDate: string,
        endDate: string,
        trx = database
    ): Promise<UserActivity[]> {
        try {
            const result = await trx
                .select()
                .from(userActivities)
                .where(
                    and(
                        eq(userActivities.userId, userId),
                        gte(userActivities.activityDate, startDate),
                        lte(userActivities.activityDate, endDate)
                    )
                )
                .orderBy(desc(userActivities.activityDate));

            return result;
        } catch (error) {
            console.error("Error getting user activities in range:", error);
            throw new Error("Error getting user activities in range");
        }
    }

    /**
     * Get request count per day for a user
     * @param userId Internal user ID
     * @param days Number of days to look back
     */
    async getUserActivityCountPerDay(
        userId: UserId,
        days: number = 30,
        trx = database
    ): Promise<{ date: string; count: number }[]> {
        try {
            const startDate = DateTime.fromJSDate(nowInBerlin()).minus({ days }).toISODate()!;

            const result = await trx
                .select({
                    date: userActivities.activityDate,
                    count: userActivities.requestCount,
                })
                .from(userActivities)
                .where(
                    and(
                        eq(userActivities.userId, userId),
                        gte(userActivities.activityDate, startDate)
                    )
                )
                .orderBy(asc(userActivities.activityDate));

            return result.map(r => ({ date: r.date, count: r.count }));
        } catch (error) {
            console.error("Error getting activity count per day:", error);
            throw new Error("Error getting activity count per day");
        }
    }

    /**
     * Get users who haven't been active for a specified number of days
     * @param daysInactive Number of days of inactivity
     */
    async getInactiveUsers(daysInactive: number, trx = database): Promise<{
        userId: UserId;
        lastActivity: Date;
    }[]> {
        try {
            const thresholdDate = DateTime.fromJSDate(nowInBerlin()).minus({ days: daysInactive }).toISODate()!;

            // Get the latest activity for each user
            const result = await trx
                .select({
                    userId: userActivities.userId,
                    lastActivity: sql<Date>`MAX(${userActivities.lastActivityAt})`,
                })
                .from(userActivities)
                .groupBy(userActivities.userId)
                .having(sql`MAX(${userActivities.activityDate}) < ${thresholdDate}`)
                .orderBy(asc(sql`MAX(${userActivities.activityDate})`));

            return result;
        } catch (error) {
            console.error("Error getting inactive users:", error);
            throw new Error("Error getting inactive users");
        }
    }

    /**
     * Get most active users in a time period (by total requests)
     * @param days Number of days to look back
     * @param limit Number of users to return
     */
    async getMostActiveUsers(
        days: number = 30,
        limit: number = 10,
        trx = database
    ): Promise<{ userId: UserId; totalRequests: number }[]> {
        try {
            const startDate = DateTime.fromJSDate(nowInBerlin()).minus({ days }).toISODate()!;

            const result = await trx
                .select({
                    userId: userActivities.userId,
                    totalRequests: sql<number>`SUM(${userActivities.requestCount})::int`,
                })
                .from(userActivities)
                .where(gte(userActivities.activityDate, startDate))
                .groupBy(userActivities.userId)
                .orderBy(desc(sql`SUM(${userActivities.requestCount})`))
                .limit(limit);

            return result;
        } catch (error) {
            console.error("Error getting most active users:", error);
            throw new Error("Error getting most active users");
        }
    }

    /**
     * Get overall activity statistics
     */
    async getActivityStats(trx = database): Promise<{
        totalRequests: number;
        uniqueUsersToday: number;
        uniqueUsersThisWeek: number;
        uniqueUsersThisMonth: number;
    }> {
        try {
            const now = DateTime.fromJSDate(nowInBerlin());
            const today = now.toISODate()!;
            const weekStart = now.startOf("week").toISODate()!;
            const monthStart = now.startOf("month").toISODate()!;

            // Total requests across all days
            const totalResult = await trx
                .select({ total: sql<number>`SUM(${userActivities.requestCount})::int` })
                .from(userActivities);

            // Unique users today
            const todayResult = await trx
                .select({ count: sql<number>`COUNT(DISTINCT ${userActivities.userId})::int` })
                .from(userActivities)
                .where(eq(userActivities.activityDate, today));

            // Unique users this week
            const weekResult = await trx
                .select({ count: sql<number>`COUNT(DISTINCT ${userActivities.userId})::int` })
                .from(userActivities)
                .where(gte(userActivities.activityDate, weekStart));

            // Unique users this month
            const monthResult = await trx
                .select({ count: sql<number>`COUNT(DISTINCT ${userActivities.userId})::int` })
                .from(userActivities)
                .where(gte(userActivities.activityDate, monthStart));

            return {
                totalRequests: totalResult[0]?.total || 0,
                uniqueUsersToday: todayResult[0]?.count || 0,
                uniqueUsersThisWeek: weekResult[0]?.count || 0,
                uniqueUsersThisMonth: monthResult[0]?.count || 0,
            };
        } catch (error) {
            console.error("Error getting activity stats:", error);
            throw new Error("Error getting activity stats");
        }
    }

    /**
     * Clean up old activity records (for GDPR compliance or performance)
     * @param daysToKeep Number of days of history to keep
     */
    async cleanupOldActivities(daysToKeep: number = 365, trx = database): Promise<number> {
        try {
            const cutoffDate = DateTime.fromJSDate(nowInBerlin()).minus({ days: daysToKeep }).toISODate()!;

            const result = await trx
                .delete(userActivities)
                .where(lte(userActivities.activityDate, cutoffDate))
                .returning({ id: userActivities.id });

            return result.length;
        } catch (error) {
            console.error("Error cleaning up old activities:", error);
            throw new Error("Error cleaning up old activities");
        }
    }

    /**
     * Get detailed request history for a specific day
     * @param userId Internal user ID
     * @param date Activity date (YYYY-MM-DD)
     */
    async getDailyRequestDetails(
        userId: UserId,
        date: string,
        trx = database
    ): Promise<RequestDetail[]> {
        try {
            const result = await trx
                .select({ requests: userActivities.requests })
                .from(userActivities)
                .where(
                    and(
                        eq(userActivities.userId, userId),
                        eq(userActivities.activityDate, date)
                    )
                )
                .limit(1);

            if (result.length === 0 || !result[0].requests) {
                return [];
            }

            return result[0].requests as RequestDetail[];
        } catch (error) {
            console.error("Error getting daily request details:", error);
            throw new Error("Error getting daily request details");
        }
    }

    /**
     * Get all unique status codes from user activities (for filter dropdown)
     * Efficient query that only fetches distinct status codes
     * @param trx Optional transaction
     */
    async getAvailableStatusCodes(trx = database): Promise<number[]> {
        try {
            // Use PostgreSQL's JSONB functions to extract unique status codes efficiently
            const result = await trx.execute<{ statusCode: number }>(sql`
                SELECT DISTINCT (elem->>'statusCode')::int as "statusCode"
                FROM ${userActivities},
                jsonb_array_elements(${userActivities.requests}) as elem
                WHERE elem->>'statusCode' IS NOT NULL
                ORDER BY "statusCode" ASC
            `);

            // Convert result to array and filter out NaN values
            const rows = Array.isArray(result) ? result : [];
            return rows.map((r: { statusCode: number }) => r.statusCode).filter((code: number) => !isNaN(code));
        } catch (error) {
            console.error("Error getting available status codes:", error);
            throw new Error("Error getting available status codes");
        }
    }

    /**
     * Get filtered user activities with search and status code filters
     * @param userId Internal user ID
     * @param startDate Start date (YYYY-MM-DD)
     * @param endDate End date (YYYY-MM-DD)
     * @param search Search term for endpoints, errors, userAgent
     * @param statusCodes Array of status codes to filter by
     * @param trx Optional transaction
     */
    async getFilteredUserActivities(
        userId: UserId,
        startDate: string,
        endDate: string,
        search?: string,
        statusCodes?: number[],
        trx = database
    ): Promise<UserActivity[]> {
        try {
            // First get activities in date range
            const activities = await this.getUserActivitiesInRange(userId, startDate, endDate, trx);

            // If no filters, return as is
            if (!search && (!statusCodes || statusCodes.length === 0)) {
                return activities;
            }

            // Filter activities based on their requests
            return activities.map(activity => {
                if (!activity.requests || !Array.isArray(activity.requests)) {
                    return activity;
                }

                // Filter requests based on search and statusCodes
                const filteredRequests = (activity.requests as RequestDetail[]).filter(req => {
                    // Status code filter
                    if (statusCodes && statusCodes.length > 0) {
                        if (!req.statusCode || !statusCodes.includes(req.statusCode)) {
                            return false;
                        }
                    }

                    // Search filter (case-insensitive)
                    if (search) {
                        const searchLower = search.toLowerCase();
                        const matchesEndpoint = req.endpoint?.toLowerCase().includes(searchLower);
                        const matchesError = req.error?.toLowerCase().includes(searchLower);
                        const matchesUserAgent = req.userAgent?.toLowerCase().includes(searchLower);
                        const matchesMethod = req.method?.toLowerCase().includes(searchLower);

                        if (!matchesEndpoint && !matchesError && !matchesUserAgent && !matchesMethod) {
                            return false;
                        }
                    }

                    return true;
                });

                // Return activity with filtered requests and updated count
                return {
                    ...activity,
                    requests: filteredRequests,
                    requestCount: filteredRequests.length,
                };
            }).filter(activity => (activity.requestCount ?? 0) > 0); // Remove activities with no matching requests
        } catch (error) {
            console.error("Error getting filtered user activities:", error);
            throw new Error("Error getting filtered user activities");
        }
    }
}

export const userActivityService = new UserActivityService();

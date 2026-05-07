import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { database } from "@/db";
import { UserActivity, userActivities, UserId, User, QuickStats } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { DateTime } from "luxon";
import { userActivityService } from "./user-activity.service";

// ===== EXPORTED TYPES FOR FRONTEND =====

export type RequestDetail = {
    timestamp: string;
    endpoint: string;
    method: string;
    statusCode?: number;
    error?: string;
    userAgent?: string;
    ipAddress?: string;
};

export type ActivityOverview = {
    summary: {
        totalDays: number;
        totalRequests: number;
        averageRequestsPerDay: number;
        firstActivity: string | null; // ISO timestamp
        lastActivity: string | null; // ISO timestamp
        mostActiveDay: {
            date: string;
            requestCount: number;
        } | null;
    };
    dailyActivities: {
        date: string;
        requestCount: number;
        firstActivityAt: string; // ISO timestamp
        lastActivityAt: string; // ISO timestamp
        duration: string; // Readable duration (e.g., "8 hours 23 minutes")
    }[];
    recentRequests: RequestDetail[]; // Last 20 requests across all days
    topEndpoints: {
        endpoint: string;
        count: number;
    }[];
};

export type ActivityFilters = {
    date?: string; // YYYY-MM-DD - Single day (takes priority over startDate/endDate/days)
    startDate?: string; // YYYY-MM-DD
    endDate?: string; // YYYY-MM-DD
    days?: number; // Alternative to startDate/endDate (e.g., last 30 days)
    search?: string; // Search in endpoints, errors, userAgent, etc.
    statusCodes?: number[]; // Filter by specific HTTP status codes
    page?: number; // Pagination: current page (1-indexed)
    resultsPerPage?: number; // Pagination: items per page
};





export type UserWithActivityOverview = {
    user: User
    activityOverview: ActivityOverview;
};

export type PaginatedUsersWithActivityOverview = {
    data: UserWithActivityOverview[];
    pagination: {
        page: number;
        resultsPerPage: number;
        totalPages: number;
        totalResults: number;
        availableStatusCodes: number[]; // All unique status codes available for filtering
    };
};



class UserActivityUseCase {

    /**
     * Get comprehensive activity overview for a user
     * Perfect for frontend dashboard components
     * @param userId Internal user ID
     * @param filters Optional filters (date range or last N days)
     */
    async getActivityOverview(userId: UserId, filters?: ActivityFilters): Promise<ActivityOverview> {
        try {
            // Determine date range
            let startDate: string;
            let endDate: string;

            // Priority 1: Single date (if provided, both start and end are the same day)
            if (filters?.date) {
                startDate = filters.date;
                endDate = filters.date;
            }
            // Priority 2: Date range (startDate + endDate)
            else if (filters?.startDate && filters?.endDate) {
                startDate = filters.startDate;
                endDate = filters.endDate;
            }
            // Priority 3: Last N days
            else {
                const now = DateTime.fromJSDate(nowInBerlin());
                const days = filters?.days || 30; // Default to last 30 days
                endDate = now.toISODate()!;
                startDate = now.minus({ days }).toISODate()!;
            }

            // Get filtered activities (with search and status code filters)
            const activities = await userActivityService.getFilteredUserActivities(
                userId,
                startDate,
                endDate,
                filters?.search,
                filters?.statusCodes
            );

            if (activities.length === 0) {
                return this.getEmptyOverview();
            }

            // Calculate summary statistics
            const totalDays = activities.length;
            const totalRequests = activities.reduce((sum, a) => sum + (a.requestCount ?? 0), 0);
            const averageRequestsPerDay = Math.round(totalRequests / totalDays);

            // Find most active day
            const mostActiveDay = activities.reduce((max, a) =>
                (a.requestCount ?? 0) > (max.requestCount ?? 0) ? a : max
                , activities[0]);

            // Get first and last activity timestamps
            const sortedByFirst = [...activities].sort((a, b) =>
                new Date(a.firstActivityAt).getTime() - new Date(b.firstActivityAt).getTime()
            );
            const sortedByLast = [...activities].sort((a, b) =>
                new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
            );

            const firstActivity = sortedByFirst[0]?.firstActivityAt;
            const lastActivity = sortedByLast[0]?.lastActivityAt;

            // Build daily activities with duration
            const dailyActivities = activities.map(a => {
                const first = DateTime.fromJSDate(new Date(a.firstActivityAt));
                const last = DateTime.fromJSDate(new Date(a.lastActivityAt));
                const diff = last.diff(first, ['hours', 'minutes']);

                return {
                    date: a.activityDate,
                    requestCount: a.requestCount ?? 0,
                    firstActivityAt: new Date(a.firstActivityAt).toISOString(),
                    lastActivityAt: new Date(a.lastActivityAt).toISOString(),
                    duration: `${Math.floor(diff.hours)} hours ${Math.floor(diff.minutes)} minutes`,
                };
            });

            // Get recent requests (last 20 across all days)
            const allRequests: RequestDetail[] = [];
            for (const activity of activities) {
                if (activity.requests && Array.isArray(activity.requests)) {
                    allRequests.push(...(activity.requests as RequestDetail[]));
                }
            }
            const recentRequests = allRequests
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 20);

            // Calculate top endpoints
            const endpointCounts = new Map<string, number>();
            for (const req of allRequests) {
                endpointCounts.set(req.endpoint, (endpointCounts.get(req.endpoint) || 0) + 1);
            }
            const topEndpoints = Array.from(endpointCounts.entries())
                .map(([endpoint, count]) => ({ endpoint, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            return {
                summary: {
                    totalDays,
                    totalRequests,
                    averageRequestsPerDay,
                    firstActivity: firstActivity ? new Date(firstActivity).toISOString() : null,
                    lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
                    mostActiveDay: {
                        date: mostActiveDay.activityDate,
                        requestCount: mostActiveDay.requestCount ?? 0,
                    },
                },
                dailyActivities,
                recentRequests,
                topEndpoints,
            };
        } catch (error) {
            console.error("Error getting activity overview:", error);
            throw new Error("Error getting activity overview");
        }
    }

    /**
     * Get quick stats for a user (lightweight)
     * @param userId Internal user ID
     */
    async getQuickStats(userId: UserId): Promise<QuickStats> {
        try {
            const now = DateTime.fromJSDate(nowInBerlin());
            const today = now.toISODate()!;
            const weekStart = now.startOf("week").toISODate()!;
            const monthStart = now.startOf("month").toISODate()!;

            // Get last activity
            const lastActivity = await userActivityService.getLastActivity(userId);

            // Get activities for different periods
            const [todayActivities, weekActivities, monthActivities] = await Promise.all([
                userActivityService.getUserActivitiesInRange(userId, today, today),
                userActivityService.getUserActivitiesInRange(userId, weekStart, today),
                userActivityService.getUserActivitiesInRange(userId, monthStart, today),
            ]);

            const requestsToday = todayActivities.reduce((sum, a) => sum + (a.requestCount ?? 0), 0);
            const requestsThisWeek = weekActivities.reduce((sum, a) => sum + (a.requestCount ?? 0), 0);
            const requestsThisMonth = monthActivities.reduce((sum, a) => sum + (a.requestCount ?? 0), 0);

            return {
                lastActivity: lastActivity ? lastActivity.toISOString() : null,
                requestsToday,
                requestsThisWeek,
                requestsThisMonth,
            };
        } catch (error) {
            console.error("Error getting quick stats:", error);
            throw new Error("Error getting quick stats");
        }
    }

    /**
     * Get detailed request history for a specific day
     * @param userId Internal user ID
     * @param date Activity date (YYYY-MM-DD)
     */
    async getDayDetails(userId: UserId, date: string): Promise<{
        date: string;
        requestCount: number;
        firstActivity: string;
        lastActivity: string;
        requests: RequestDetail[];
    } | null> {
        try {
            const activities = await userActivityService.getUserActivitiesInRange(userId, date, date);

            if (activities.length === 0) {
                return null;
            }

            const activity = activities[0];
            const requests = await userActivityService.getDailyRequestDetails(userId, date);

            return {
                date: activity.activityDate,
                requestCount: activity.requestCount ?? 0,
                firstActivity: new Date(activity.firstActivityAt).toISOString(),
                lastActivity: new Date(activity.lastActivityAt).toISOString(),
                requests,
            };
        } catch (error) {
            console.error("Error getting day details:", error);
            throw new Error("Error getting day details");
        }
    }

    private getEmptyOverview(): ActivityOverview {
        return {
            summary: {
                totalDays: 0,
                totalRequests: 0,
                averageRequestsPerDay: 0,
                firstActivity: null,
                lastActivity: null,
                mostActiveDay: null,
            },
            dailyActivities: [],
            recentRequests: [],
            topEndpoints: [],
        };
    }
}

export const userActivityUseCase = new UserActivityUseCase();

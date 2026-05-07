import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";

import { userActivityUseCase } from "./user-activity.useCase";
import { userService } from "@/routes/auth/users/user/user.service";


class UserActivityController {

    /**
     * Get all users with activity stats
     * Perfect for admin dashboards with user lists
     * Returns: Array of users with their activity stats
     */
    async getAllUsersWithActivityStats(_req: Request, res: Response) {
        try {
            // Get all users
            const users = await userService.getAllUsers();

            // Get activity stats for each user in parallel
            const usersWithStats = await Promise.all(
                users.map(async (user) => {
                    if (!user.id) {
                        return {
                            user: {
                                id: user.id,
                                externalUserId: user.externalUserId,
                                email: user.email,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                createdAt: user.createdAt,
                                updatedAt: user.updatedAt,
                            },
                            activityStats: null,
                        };
                    }

                    try {
                        const activityStats = await userActivityUseCase.getQuickStats(user.id);
                        return {
                            user: {
                                id: user.id,
                                externalUserId: user.externalUserId,
                                email: user.email,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                createdAt: user.createdAt,
                                updatedAt: user.updatedAt,
                            },
                            activityStats,
                        };
                    } catch (error) {
                        console.error(`Error getting stats for user ${user.id}:`, error);
                        return {
                            user: {
                                id: user.id,
                                externalUserId: user.externalUserId,
                                email: user.email,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                createdAt: user.createdAt,
                                updatedAt: user.updatedAt,
                            },
                            activityStats: null,
                        };
                    }
                })
            );

            return responseHandler(res, 200, "All users with activity stats retrieved successfully", usersWithStats);
        } catch (error) {
            console.error("Error getting all users with activity stats:", error);
            return responseHandler(res, 500, "Error getting all users with activity stats");
        }
    }

    /**
     * Get detailed activity overview for a user (with pagination and filters)
     * Perfect for user detail pages with comprehensive activity analytics
     * Returns: Paginated user activity data with available status codes
     */
    async getUserActivityOverview(req: Request, res: Response) {
        try {
            const { userId } = req.params;
            const userIdNum = parseInt(userId, 10);

            if (isNaN(userIdNum) || userIdNum <= 0) {
                return responseHandler(res, 400, "Invalid user ID");
            }

            // Get user data
            const user = await userService.getUserById(userIdNum);
            if (!user) {
                return responseHandler(res, 404, "User not found");
            }

            // Parse filters from request body
            const { search, page, resultsPerPage, statusCodes, date, startDate, endDate, days } = req.body;

            const filters: any = {};
            if (search && typeof search === "string") filters.search = search;
            if (date && typeof date === "string") filters.date = date; // Single day filter (takes priority)
            if (startDate && typeof startDate === "string") filters.startDate = startDate;
            if (endDate && typeof endDate === "string") filters.endDate = endDate;
            if (days && typeof days === "number") filters.days = days;
            if (statusCodes && Array.isArray(statusCodes)) filters.statusCodes = statusCodes.filter(c => typeof c === "number");
            if (page && typeof page === "number") filters.page = page;
            if (resultsPerPage && typeof resultsPerPage === "number") filters.resultsPerPage = resultsPerPage;

            // Get detailed activity overview with filters
            const activityOverview = await userActivityUseCase.getActivityOverview(userIdNum, filters);

            // Get available status codes for frontend filter
            const { userActivityService } = await import("./user-activity.service");
            const availableStatusCodes = await userActivityService.getAvailableStatusCodes();

            // Build user with activity overview
            const userWithActivityOverview = {
                user: {
                    id: user.id,
                    externalUserId: user.externalUserId,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                },
                activityOverview,
            };

            // Apply pagination to recentRequests (not dailyActivities!)
            const currentPage = filters.page || 1;
            const itemsPerPage = filters.resultsPerPage || activityOverview.recentRequests.length; // Default: all requests
            const totalResults = activityOverview.recentRequests.length; // Total number of matching requests
            const totalPages = Math.ceil(totalResults / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;

            // Paginate recent requests
            const paginatedRecentRequests = activityOverview.recentRequests.slice(startIndex, endIndex);

            const result = {
                data: [{
                    ...userWithActivityOverview,
                    activityOverview: {
                        ...activityOverview,
                        recentRequests: paginatedRecentRequests, // Paginated requests
                    },
                }],
                pagination: {
                    page: currentPage,
                    resultsPerPage: itemsPerPage,
                    totalPages,
                    totalResults, // Total number of requests (not days)
                    availableStatusCodes,
                },
            };

            return responseHandler(res, 200, "User activity overview retrieved successfully", result);
        } catch (error) {
            console.error("Error getting user activity overview:", error);
            return responseHandler(res, 500, "Error getting user activity overview");
        }
    }

}


export const userActivityController = new UserActivityController();
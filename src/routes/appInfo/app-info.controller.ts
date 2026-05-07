import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { getUserIdFromRequest } from "@/util/utils";
import { Role, User } from "@/db/schema";
import { permissionUseCase } from "@/routes/auth/roles/permissions/permission.useCase";
import { roleService } from "@/routes/auth/roles/roles/role.service";
import { userService } from "@/routes/auth/users/user/user.service";
import {
    subscriptionLimitsService,
    type EffectiveSubscriptionLimits,
    type EffectiveSubscriptionUsage,
} from "@/lib/entitlements/subscription-limits.service";
import { SUBSCRIPTION_MANAGE_URL } from "@/app.config";
import { AMP_MANIFEST } from "@/routes/amp-proxy/amp.manifest";


export type InfoData = {
    plannerUser: User;
    plannerUsers?: User[];
    userRoles: Role[];
    subscriptionLimits?: EffectiveSubscriptionLimits;
    subscriptionUsage?: EffectiveSubscriptionUsage;
    subscription?: {
        upgradeUrl: string | null;
    };
}


class AppInfoController {

    // route: /app-info/
    async getAppInfo(req: Request, res: Response) {
        try {
            const requestedByUserId = await getUserIdFromRequest(req);
            if (!requestedByUserId) return responseHandler(res, 400, "Invalid Request: User ID not found");
            const requestedBy = await userService.getUserById(requestedByUserId);
            if (!requestedBy) return responseHandler(res, 404, "User not found");

            const userRoles = await roleService.getActiveUserRolesWithHierarchy(requestedByUserId);
            const subscriptionLimits = await subscriptionLimitsService.getEffectiveLimitsForUser(requestedByUserId);
            const subscriptionUsage = await subscriptionLimitsService.getUsageForUser(requestedByUserId);
            const upgradeUrl = SUBSCRIPTION_MANAGE_URL;

            const infoData: InfoData = {
                plannerUser: requestedBy,
                userRoles,
                subscriptionLimits,
                subscriptionUsage,
                subscription: {
                    upgradeUrl,
                },
            };

            return responseHandler(res, 200, undefined, infoData);
        } catch (error: any) {
            console.error("Error in getAppInfo:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

    async getOwnPermissions(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 401, "Unauthorized");

            const permissions = await permissionUseCase.getUserPermissions(userId);
            return responseHandler(res, 200, undefined, permissions);
        } catch (error) {
            return responseHandler(res, 500, "Internal Server Error");
        }
    }

    async getHealth(_req: Request, res: Response) {
        const checks: Array<{ name: string; status: "ok" | "warning" | "error"; latencyMs: number | null; message?: string }> = [];

        // Database check
        const dbStart = Date.now();
        try {
            const { database } = await import("@/db");
            const { sql } = await import("drizzle-orm");
            await database.execute(sql`SELECT 1`);
            checks.push({ name: "database", status: "ok", latencyMs: Date.now() - dbStart, message: "PostgreSQL erreichbar" });
        } catch (e: any) {
            checks.push({ name: "database", status: "error", latencyMs: Date.now() - dbStart, message: `PostgreSQL nicht erreichbar: ${e.message}` });
        }

        // Memory check
        const mem = process.memoryUsage();
        const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
        const rssMb = Math.round(mem.rss / 1024 / 1024);
        checks.push({
            name: "memory",
            status: rssMb > 512 ? "warning" : "ok",
            latencyMs: null,
            message: `Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)} MB (${heapPercent}%)`,
        });

        // Event loop check
        const loopStart = Date.now();
        const loopLag = await new Promise<number>(resolve => setImmediate(() => resolve(Date.now() - loopStart)));
        checks.push({
            name: "event_loop",
            status: loopLag > 100 ? "warning" : "ok",
            latencyMs: loopLag,
            message: `Lag: ${loopLag}ms`,
        });

        const hasError = checks.some(c => c.status === "error");
        const hasWarning = checks.some(c => c.status === "warning");
        const httpStatus = hasError ? 503 : 200;

        return responseHandler(res, httpStatus, undefined, {
            status: hasError ? "unhealthy" : hasWarning ? "degraded" : "healthy",
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version ?? "unknown",
            checks,
        });
    }

    async getManifest(_req: Request, res: Response) {
        return responseHandler(res, 200, undefined, AMP_MANIFEST);
    }
}


export const appInfoController = new AppInfoController();

import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { getLanguageFromRequest, getExternalUserIdFromRequest } from "@/util/utils";
import { logService } from "@/routes/log-service/log-service.service";
import { permissionUseCase } from "@/routes/auth/roles/permissions/permission.useCase";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { AppLogLevel } from "@/db/schema";


class LogServiceController {

    async searchLogs(req: Request, res: Response) {
        try {
            const language = await getLanguageFromRequest(req);
            if (!language) return responseHandler(res, 400, "Invalid Request");
            const rawSearch = req.query.search
            const search = typeof rawSearch === "string" && rawSearch.trim().length > 0
                ? rawSearch.trim()
                : undefined

            // page
            const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page
            let page = parseInt(String(rawPage ?? "1"), 10)
            if (!Number.isFinite(page) || page < 1) page = 1

            // pageSize (clampen, z.B. 500)
            const rawPageSize = Array.isArray(req.query.pageSize) ? req.query.pageSize[0] : req.query.pageSize
            let pageSize = parseInt(String(rawPageSize ?? "50"), 10)
            if (!Number.isFinite(pageSize) || pageSize < 10) pageSize = 10
            if (pageSize > 500) pageSize = 500

            // level (Enum-Check)
            const rawLevel = Array.isArray(req.query.level) ? req.query.level[0] : req.query.level
            const allowedLevels = ["debug", "info", "warn", "error"] as const
            const level = allowedLevels.includes(rawLevel as any)
                ? (rawLevel as AppLogLevel)
                : undefined

            // date parsing helper
            const parseDate = (value: unknown): Date | undefined => {
                if (typeof value !== "string" || !value.trim()) return undefined
                const d = new Date(value)
                return Number.isNaN(d.getTime()) ? undefined : d
            }

            const dateFrom = parseDate(
                Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : req.query.dateFrom,
            )
            const dateTo = parseDate(
                Array.isArray(req.query.dateTo) ? req.query.dateTo[0] : req.query.dateTo,
            )

            const filters = {
                level: level,
                dateFrom: dateFrom,
                dateTo: dateTo,
            };
            const logs = await logService.searchLogs(search, page, pageSize, filters);
            const userId = getExternalUserIdFromRequest(req)
            if (!userId) return responseHandler(res, 401, "Invalid Request");
            let canDelete = false
            if (logs) {
                const canDeleteFromDb = await permissionUseCase.hasExternalUserPermission(userId, AppPermissions.LogDelete);
                canDelete = canDeleteFromDb;
            }

            return responseHandler(res, 200, undefined, { logs: logs, canDelete: canDelete });
        } catch (error: any) {
            console.error("Error in getLogs:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

    async deleteLog(req: Request, res: Response) {
        try {
            const logId = parseInt(req.params.logId, 10);
            if (isNaN(logId)) return responseHandler(res, 400, "Invalid Request");
            const userId = getExternalUserIdFromRequest(req)
            if (!userId) return responseHandler(res, 401, "Invalid Request");
            const canDelete = await permissionUseCase.hasExternalUserPermission(userId, AppPermissions.LogDelete);
            if (!canDelete) return responseHandler(res, 403, "Forbidden: No permission to delete logs");
            await logService.deleteLog(logId);
            return responseHandler(res, 200, "Log deleted successfully");
        } catch (error: any) {
            console.error("Error in deleteLog:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async deleteLogs(req: Request, res: Response) {
        try {
            const logIdsParam = req.params.logIds;
            if (!logIdsParam) return responseHandler(res, 400, "No logs to delete");
            const logIds = logIdsParam.split(",").map(id => parseInt(id, 10));
            if (logIds.some(id => isNaN(id))) return responseHandler(res, 400, "Invalid Request: One or more log IDs are not valid numbers");

            const userId = getExternalUserIdFromRequest(req)
            if (!userId) return responseHandler(res, 401, "Invalid Request");
            const canDelete = await permissionUseCase.hasExternalUserPermission(userId, AppPermissions.LogDelete);
            if (!canDelete) return responseHandler(res, 403, "Forbidden: No permission to delete logs");

            await logService.deleteLogs(logIds);


            return responseHandler(res, 200, "Logs deleted successfully");
        } catch (error: any) {
            console.error("Error in deleteLogs:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

}



export const logServiceController = new LogServiceController();
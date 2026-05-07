import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { settingsService } from "./settings.service";
import { getUserIdFromRequest } from "@/util/utils";
import { permissionUseCase } from "@/routes/auth/roles/permissions/permission.useCase";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { AppSettingsKey } from "../../db/individual/individual-settings";



class SettingsController {

    async getAll(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 400, "Unauthorized");
            const canEdit = await permissionUseCase.hasUserPermission(userId, AppPermissions.SettingsEdit);
          
            const settings = await settingsService.getAll();
            return responseHandler(res, 200, undefined, {settings, canEdit});
        } catch (error: any) {
            console.error("Error in getAll:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

    async updateAppSetting(req: Request, res: Response) {
        const settingId = parseInt(req.params.settingId, 10);
        if (isNaN(settingId)) return responseHandler(res, 400, "Invalid Request");
        const key = req.params.key as AppSettingsKey;
        const value = req.body.value;

        try {

            const updatedSetting = await settingsService.updateAppSetting(settingId, key, value);
            return responseHandler(res, 200, undefined, updatedSetting);
        } catch (error: any) {
            console.error("Error in updateAppSetting:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }




}



export const settingsController = new SettingsController();
import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";

import { WebhookService, webhookService } from "./webhook.service";
import { getExternalUserIdFromRequest } from "@/util/utils";
import { permissionUseCase } from "@/routes/auth/roles/permissions/permission.useCase";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { userService } from "@/routes/auth/users/user/user.service";

// Standardisierte Response-Funktion


class WebhookController {


    async getWebhooks(req: Request, res: Response) {
        try {
            const userId = await getExternalUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 400, "Invalid Request");
            const webhooks = await webhookService.getWebhooks();

            const user = await userService.getUserByExternalUserId(userId);
            if (!user) return responseHandler(res, 403, "Forbidden: User not found");

            const canDelete = await permissionUseCase.hasExternalUserPermission(userId, AppPermissions.WebhookDelete);
            const result = { webhooks: webhooks, canDelete: canDelete };
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in getWebhooks:", error);
            return responseHandler(res, 500, error || "Internal Server Error");
        }
    }

    async deleteWebhook(req: Request, res: Response) {
        try {
            const webhookId = parseInt(req.params.webhookId, 10);
            if (!webhookId || isNaN(webhookId)) return responseHandler(res, 400, "Invalid Request");

            await webhookService.deleteWebhook(webhookId);

            return responseHandler(res, 200, "Webhook deleted successfully");
        } catch (error: any) {
            console.error("Error in deleteWebhook:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

    async deleteWebhooks(req: Request, res: Response) {
        try {
            const webhookIdsParam = req.params.webhookIds;
            if (!webhookIdsParam) return responseHandler(res, 400, "No webhooks to delete");
            const webhookIds = webhookIdsParam.split(",").map(id => parseInt(id, 10));
            if (webhookIds.some(id => isNaN(id))) return responseHandler(res, 400, "Invalid Request: One or more webhook IDs are not valid numbers");

            await webhookService.deleteWebhooks(webhookIds);

            return responseHandler(res, 200, "Webhooks deleted successfully");
        } catch (error: any) {
            console.error("Error in deleteWebhooks:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }




}


export const webhookController = new WebhookController();
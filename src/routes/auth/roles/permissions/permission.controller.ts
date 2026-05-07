import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { permissionService } from "./permission.service";
import { permissionUseCase } from "./permission.useCase";
import { getUserIdFromRequest } from "@/util/utils";





class PermissionController {



    async getAllPermissions(req: Request, res: Response) {
        try {
            const permissions = await permissionService.getAll();
            return responseHandler(res, 200, undefined, permissions);
        } catch (error: any) {
            console.error("Error in getAllPermissions:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

    async assignPermissionToRole(req: Request, res: Response) {
        try {
            const roleId = parseInt(req.params.roleId, 10);
            const permissionId = parseInt(req.params.permissionId, 10);
            if (isNaN(roleId) || isNaN(permissionId)) return responseHandler(res, 400, "Invalid Request");
            const requestorId = await getUserIdFromRequest(req);
            if (!requestorId) return responseHandler(res, 400, "Invalid Request: User ID not found");

            const result = await permissionUseCase.assignPermissionToRole(roleId, permissionId, requestorId);
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in assignPermissionToRole:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async unassignPermissionFromRole(req: Request, res: Response) {
        try {
            const roleId = parseInt(req.params.roleId, 10);
            const permissionId = parseInt(req.params.permissionId, 10);
            if (isNaN(roleId) || isNaN(permissionId)) return responseHandler(res, 400, "Invalid Request");

            const requestorId = await getUserIdFromRequest(req);
            if (!requestorId) return responseHandler(res, 400, "Invalid Request");

            const result = await permissionUseCase.unassignPermissionFromRole(roleId, permissionId, requestorId);
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
           
            if (error.message.includes("Cannot unassign ManagePermissions from admin role")) {
                console.error("Cannot delete manage permissions:", error);
                return responseHandler(res, 400, error.message);
            }
            console.error("Error in unassignPermissionFromRole:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

    async getAssignments(req: Request, res: Response) {
        try {
            const assignments = await permissionService.getAssignments();
            return responseHandler(res, 200, undefined, assignments);
        } catch (error: any) {
            console.error("Error in getAssignments:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async createPermission(req: Request, res: Response) {
        try {
            const { name, description } = req.body;
            if (!name || !description) return responseHandler(res, 400, "Invalid Request: Name and description are required");

            const result = await permissionService.createPermission(name, description);
            return responseHandler(res, 201, undefined, result);
        } catch (error: any) {
            console.error("Error in createPermission:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }

    async syncPermissions(req: Request, res: Response) {
        try {
            const result = await permissionService.syncDefaultPermissions();

            const message = result.created.length > 0
                ? `Sync completed: ${result.created.length} permission(s) created, ${result.existing.length} already existed.`
                : `All ${result.total} default permissions are already in sync.`;

            return responseHandler(res, 200, message, result);
        } catch (error: any) {
            console.error("Error in syncPermissions:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


}


export const permissionController = new PermissionController();
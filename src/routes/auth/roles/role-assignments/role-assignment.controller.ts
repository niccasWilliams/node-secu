import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { roleAssignmentService } from "./role-assignment.service";
import { DateTime } from "luxon";
import { APP_TIME_ZONE } from "../../../../app.config";
import { getUserIdFromRequest } from "@/util/utils";






class RoleAssignmentController {

   
        
    async createRoleAssignment(req: Request, res: Response) {
        try {
            const userId = parseInt(req.params.userId, 10);
            const roleId = parseInt(req.params.roleId, 10);
            const requestorUserId = await getUserIdFromRequest(req);
            if(!requestorUserId) return responseHandler(res, 401, "Unauthorized");
            if (isNaN(userId) || isNaN(roleId)) return responseHandler(res, 400, "Invalid Request");

            const validFrom = req.body.validFrom ? DateTime.fromISO(req.body.validFrom) : DateTime.now().setZone(APP_TIME_ZONE);


            const newAssignment = await roleAssignmentService.createRoleAssignment(userId, roleId, validFrom, requestorUserId);
            return responseHandler(res, 201, "Role assignment created", newAssignment);
        } catch (error: any) {
            console.error("Error in createRoleAssignment:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }



    async revokeUserFromRole(req: Request, res: Response) {
        try {
            const userId = parseInt(req.params.userId, 10);
            const roleId = parseInt(req.params.roleId, 10);
            const requestorUserId = await getUserIdFromRequest(req);
            if(!requestorUserId) return responseHandler(res, 401, "Unauthorized");
            if (isNaN(userId) || isNaN(roleId)) return responseHandler(res, 400, "Invalid Request");

            const result = await roleAssignmentService.revokeUserFromRole(userId, roleId, requestorUserId);
            return responseHandler(res, 200, "Role assignment revoked", result);
        } catch (error: any) {
            console.error("Error in expireUserRoleAssignment:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }



    async getAllRoleAssignments(req: Request, res: Response) {
        try {
            const roleAssignments = await roleAssignmentService.getAllRoleAssignments();
            return responseHandler(res, 200, undefined, roleAssignments);
        } catch (error: any) {
            console.error("Error in getAllRoleAssignments:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async getUserRoleAssignments(req: Request, res: Response) {
        try {
            const userId = parseInt(req.params.userId, 10);
            if (isNaN(userId)) return responseHandler(res, 400, "Invalid Request");

            const assignments = await roleAssignmentService.getUserRoleAssignments(userId);
            return responseHandler(res, 200, undefined, assignments);
        } catch (error: any) {
            console.error("Error in getUserRoleAssignments:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }




}


export const roleAssignmentController = new RoleAssignmentController();
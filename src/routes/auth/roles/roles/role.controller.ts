import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";

import { roleService } from "./role.service";
import { Permission, Role, RoleAssignment, RolePermission } from "@/db/schema";
import { roleAssignmentService } from "../role-assignments/role-assignment.service";
import { AppPermissions, permissionService } from "../permissions/permission.service";
import { permissionUseCase } from "../permissions/permission.useCase";
import { getUserIdFromRequest } from "@/util/utils";

export type RoleBaseData = {
    roles: Role[];
    roleAssignments: RoleAssignment[];
    permissions: Permission[];
    rolePermissions: RolePermission[];
    canSeeHistory: boolean;
}




class RoleController {

    async createRole(req: Request, res: Response) {
        try {
            const { name, description, isSellable } = req.body;
            if (!name || !description) return responseHandler(res, 400, "Invalid Request");

            await roleService.createRole(name, description, isSellable);
            //we do not return the created role here, bc. it is not needed in the response
            return responseHandler(res, 201, "Role created successfully");
        } catch (error: any) {
            console.error("Error in createRole:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async deleteRole(req: Request, res: Response) {
        try {
            const roleId = parseInt(req.params.roleId, 10);
            if (isNaN(roleId)) return responseHandler(res, 400, "Invalid Request");


            const deletedRole = await roleService.deleteRole(roleId);
            if (!deletedRole) return responseHandler(res, 404, "Role not found");
            return responseHandler(res, 200, "Role deleted successfully", deletedRole);
        } catch (error: any) {
            console.error("Error in deleteRole:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async getRoleById(req: Request, res: Response) {
        try {
            const roleId = parseInt(req.params.roleId, 10);
            if (isNaN(roleId)) return responseHandler(res, 400, "Invalid Request");


            const role = await roleService.getRoleById(roleId);
            if (!role) return responseHandler(res, 404, "Role not found");
            return responseHandler(res, 200, undefined, role);
        } catch (error: any) {
            console.error("Error in getRoleById:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async updateRole(req: Request, res: Response) {
        try {
            const roleId = parseInt(req.params.roleId, 10);
            if (isNaN(roleId)) return responseHandler(res, 400, "Invalid Request");
            const { name, description } = req.body;
            if (!name || !description) return responseHandler(res, 400, "Invalid Request");


            const updatedRole = await roleService.updateRole(roleId, name, description);
            if (!updatedRole) return responseHandler(res, 404, "Role not found");
            return responseHandler(res, 200, "Role updated successfully", updatedRole);
        } catch (error: any) {
            console.error("Error in updateRole:", error);
            return responseHandler(res, 500, error.message || "Internal Server Error");
        }
    }


    async getAllRoles(req: Request, res: Response) {
        try {
            const userId = await getUserIdFromRequest(req);
            if (!userId || isNaN(userId)) return responseHandler(res, 400, "Invalid Request");
            const allRoles = await roleService.getAllRoles();
            const getAllRoleAssignments = await roleAssignmentService.getAllRoleAssignments();
            const allPermissions = await permissionService.getAll();

            let finalRolePermissions: RolePermission[] = [];
            const canSeeHistory = await permissionUseCase.hasUserPermission(userId, AppPermissions.PermissionsHistoryView);
            if (!canSeeHistory) {

                finalRolePermissions = await permissionService.getAllActiveRolePermissions();
            } else {
                finalRolePermissions = await permissionService.getAllRolePermissions();
            }
            const result: RoleBaseData = {
                roles: allRoles,
                roleAssignments: getAllRoleAssignments,
                permissions: allPermissions,
                rolePermissions: finalRolePermissions,
                canSeeHistory: canSeeHistory,
            };

            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in getAllRoles:", error);
            return responseHandler(res, 500, error || "Internal Server Error");
        }
    }









}


export const roleController = new RoleController();

import { database } from "@/db";
import { Permission} from "@/db/schema";

import { roleAssignmentService } from "../role-assignments/role-assignment.service";
import { AppPermissions, AppPermissionValue, permissionService } from "./permission.service";
import { roleService } from "../roles/role.service";
import { userService } from "@/routes/auth/users/user/user.service";


class PermissionUseCase {




    async getUserPermissions(userId: number, trx = database): Promise<Permission[]> {
        try {
            const userRoles = await roleAssignmentService.getUserRoleAssignments(userId, trx);
            const permissionLists = await Promise.all(
                userRoles.map(role => permissionService.getRolePermissions(role.roleId, trx))
            );
            const flatPermissions = permissionLists.flat();


            const uniquePermissions = Array.from(
                new Map(flatPermissions.map(p => [p.name, p])).values()
            );

            return uniquePermissions;
        } catch (error) {
            console.error("Error getting user permissions:", error);
            throw new Error("Error getting user permissions");
        }
    }


    async assignPermissionToRole(roleId: number, permissionId: number, assignedBy: number, trx = database): Promise<void> {
        try {
            const user = await userService.getUserByExternalUserId(assignedBy, trx);
            if (!user || !user.id) throw new Error(`User with ID ${assignedBy} does not exist`);
           

            const permission = await permissionService.getById(permissionId, trx);
            if (!permission) {
                throw new Error(`Permission with ID ${permissionId} does not exist`);
            }
            const currentPermission = await permissionService.getByName(permission.name, trx);
            if (currentPermission) {
                const isActiveInRole = await permissionService.isPermissionActive(currentPermission.id, roleId, trx);
                if (isActiveInRole) {
                    throw new Error(`Permission ${currentPermission.name} is already assigned to role ${roleId}`);
                }
                await permissionService.assignPermissionToRole(roleId, currentPermission.id, user.id, trx);
            } 

        } catch (error) {
            console.error("Error assigning permission to role:", error);
            throw new Error("Error assigning permission to role");
        }
    }


    async unassignPermissionFromRole(roleId: number, permissionId: number, requestorUserId: number, trx = database): Promise<void> {
        try {

            const user = await userService.getUserByExternalUserId(requestorUserId, trx);
            if (!user || !user.id) throw new Error(`User with ID ${requestorUserId} does not exist`);
            const permission = await permissionService.getById(permissionId, trx);
            if (!permission) {
                throw new Error(`Permission with ID ${permissionId} does not exist`);
            }
            const role = await roleService.getRoleById(roleId, trx);
            console.log("permissionRole: ", role);
            if (!role) throw new Error(`Role with ID ${roleId} does not exist`);


            const cannotDelete1: boolean = role.name === "Admin" && permission.name === AppPermissions.PermissionsManage.toString();
            const cannotDelete2: boolean = permission.name === AppPermissions.PermissionsManage.toString() || permission.name === AppPermissions.RolesManage.toString();

            if (cannotDelete1 && cannotDelete2) {
                throw new Error("Cannot unassign ManagePermissions from admin role");
            } else {
                await permissionService.unassignPermissionFromRole(roleId, permission.id, user.id, trx);
            }
        } catch (error) {
            console.error("Error unassigning permission from role:", error);
            throw error;
        }
    }


    async hasUserPermission(userId: number, permissionName: AppPermissionValue, trx = database): Promise<boolean> {
        try {
            const userPermissions = await this.getUserPermissions(userId, trx);
            return userPermissions.some(p => p.name === permissionName);
        } catch (error) {
            console.error("Error asserting user permission:", error);
            throw error;
        }
    }

    async hasExternalUserPermission(externalUserId: number, permissionName: AppPermissionValue, trx = database): Promise<boolean> {
        try {
            const user = await userService.getUserByExternalUserId(externalUserId, trx);
            if (!user || !user.id) throw new Error(`User with external ID ${externalUserId} does not exist`);
            return await this.hasUserPermission(user.id, permissionName, trx);
        } catch (error) {
            console.error("Error asserting external user permission:", error);
            throw error;
        }
    }

    async assertUserPermission(userId: number, permissionName: AppPermissionValue, trx = database): Promise<void> {
        const hasPermission = await this.hasUserPermission(userId, permissionName, trx);
        if (!hasPermission) {
            throw new Error(`User does not have permission: ${permissionName}`);
        }
    }

    async assertExternalUserPermission(externalUserId: number, permissionName: AppPermissionValue, trx = database): Promise<void> {
        const hasPermission = await this.hasExternalUserPermission(externalUserId, permissionName, trx);
        if (!hasPermission) {
            throw new Error(`User with external ID ${externalUserId} does not have permission: ${permissionName}`);
        }
    }

}

export const permissionUseCase = new PermissionUseCase();
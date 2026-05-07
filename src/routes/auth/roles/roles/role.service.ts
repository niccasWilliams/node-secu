import { DateTime } from "luxon";
import { eq, and, inArray, or, sql, ilike, asc, desc, lt, isNull, gte, gt } from "drizzle-orm";
import { database } from "@/db";
import { Permission, permissions, Role, roleAssignments, rolePermissions, roles, User, users } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";


class RoleService {
    private db;

    constructor() {
        this.db = database;
    }



    async createRole(name: string, description: string, isSellable: boolean = false, trx = database): Promise<Role> {
        try {
            const [result] = await trx
                .insert(roles)
                .values({ name, description, isSellable, createdAt: nowInBerlin() })
                .returning();
            return result;
        } catch (error) {
            console.error("Error creating role:", error);
            throw new Error("Error creating role");
        }
    }

    async deleteRole(roleId: number, trx = database): Promise<Role | undefined> {
        try {
            const [result] = await trx
                .delete(roles)
                .where(eq(roles.id, roleId))
                .returning();
            return result;
        } catch (error) {
            console.error("Error deleting role:", error);
            throw new Error("Error deleting role");
        }
    }

    async getRoleById(roleId: number, trx = database): Promise<Role | undefined> {
        try {
            const [result] = await trx
                .select()
                .from(roles)
                .where(eq(roles.id, roleId));
            return result;
        } catch (error) {
            console.error("Error getting role by ID:", error);
            throw new Error("Error getting role by ID");
        }
    }


    async getAllRoles(trx = database): Promise<Role[]> {
        try {
            const result = await trx
                .select()
                .from(roles)
                .orderBy(desc(roles.name));
            return result;
        } catch (error) {
            console.error("Error getting all roles:", error);
            throw new Error("Error getting all roles");
        }
    }



    async updateRole(roleId: number, name: string, description: string, trx = database): Promise<Role | undefined> {
        try {
            const [result] = await trx
                .update(roles)
                .set({ name, description })
                .where(eq(roles.id, roleId))
                .returning();
            return result;
        } catch (error) {
            console.error("Error updating role:", error);
            throw new Error("Error updating role");
        }
    }


    async getRolePermissions(roleId: number): Promise<Permission[]> {
        try {
            const result = await this.db
                .select()
                .from(rolePermissions)
                .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
                .where(
                    and(
                        eq(rolePermissions.roleId, roleId),
                        or(
                            isNull(rolePermissions.validTo),
                            gt(rolePermissions.validTo, nowInBerlin())
                        )
                    )
                )
                .orderBy(asc(permissions.name));

            return result.map((rp) => rp.permissions);
        } catch (error) {
            console.error("Error getting permissions for role:", error);
            throw new Error("Error getting permissions for role");
        }
    }



    async getActiveUserRoles(userId: number, trx = database): Promise<Role[]> {
        try {
            const result = await trx
                .select()
                .from(roleAssignments)
                .innerJoin(roles, eq(roleAssignments.roleId, roles.id))
                .where(
                    and(
                        eq(roleAssignments.userId, userId),
                        eq(roleAssignments.status, "active"),
                        or(
                            isNull(roleAssignments.validTo),
                            gte(roleAssignments.validTo, nowInBerlin())
                        )
                    )
                )
                .orderBy(asc(roles.name));

            return result.map((ra) => ra.roles);
        } catch (error) {
            console.error("Error getting active roles for user:", error);
            throw new Error("Error getting active roles for user");
        }
    }

    /**
     * Returns active user roles expanded with hierarchy-implied roles.
     * E.g., a user with only "Premium Access" will also get "Base Access"
     * in the result, even without a separate role_assignment.
     */
    async getActiveUserRolesWithHierarchy(userId: number, trx = database): Promise<Role[]> {
        const { getAllEffectiveRoles } = await import("@/lib/entitlements/role-hierarchy.config");

        const directRoles = await this.getActiveUserRoles(userId, trx);
        const effectiveRoleNames = getAllEffectiveRoles(directRoles.map(r => r.name));

        const missingRoleNames = effectiveRoleNames.filter(
            name => !directRoles.some(r => r.name === name)
        );

        if (missingRoleNames.length === 0) return directRoles;

        const allRoles = await this.getAllRoles(trx);
        const impliedRoles = allRoles.filter(r => missingRoleNames.includes(r.name));
        return [...directRoles, ...impliedRoles];
    }
}

export const roleService = new RoleService();
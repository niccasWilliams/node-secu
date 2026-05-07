
import { eq, and, or, asc, isNull, gt, lte } from "drizzle-orm";
import { database } from "@/db";
import { permissions, Permission, rolePermissions, RolePermission } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { IndividualAppPermissions, individualPermissions } from "@/db/individual/individual-permissions";


// Base template permissions - DO NOT MODIFY
// These are the core permissions for the template app
const basePermissions: {
    name: string;
    description?: string;
}[] = [
        { name: "users_manage", description: "Benutzer verwalten und Rollen zuweisen" },
        { name: "users_view", description: "Alle Benutzer einsehen" },
        { name: "settings_edit", description: "App-Einstellungen bearbeiten" },
        { name: "roles_manage", description: "Rollen verwalten" },
        { name: "roles_history_view", description: "Rollenhistorie einsehen" },
        { name: "permissions_manage", description: "Berechtigungen verwalten" },
        { name: "permissions_history_view", description: "Berechtigungshistorie einsehen" },

        { name: "webhook_view", description: "Webhooks anzeigen" },
        { name: "webhook_delete", description: "Webhooks löschen" },

        { name: "log_view", description: "Logs einsehen" },
        { name: "log_delete", description: "Logs löschen" },
    ];

// Merged permissions: base + individual
export const defaultPermissions = [...basePermissions, ...individualPermissions];

// Base permission enum values
enum BaseAppPermissions {
    UsersManage = "users_manage",
    UsersView = "users_view",
    SettingsEdit = "settings_edit",
    PermissionsManage = "permissions_manage",
    PermissionsHistoryView = "permissions_history_view",
    RolesManage = "roles_manage",
    RolesHistoryView = "roles_history_view",

    WebhookView = "webhook_view",
    WebhookDelete = "webhook_delete",

    LogView = "log_view",
    LogDelete = "log_delete",
















}

// Merged AppPermissions: combines base and individual permissions
// Use this enum throughout your app with AppPermissions.
export const AppPermissions = { ...BaseAppPermissions, ...IndividualAppPermissions };

// Type alias for AppPermission values (useful for arrays and function parameters)
export type AppPermissionValue = (typeof AppPermissions)[keyof typeof AppPermissions];


class PermissionService {
    private db;

    constructor() {
        this.db = database;
    }



    async createPermission(name: string, description?: string, trx = database): Promise<Permission> {
        try {
            const [result] = await trx
                .insert(permissions)
                .values({ name, description })
                .returning();
            return result;
        } catch (error) {
            console.error("Error creating permission:", error);
            throw new Error("Error creating permission");
        }
    }

    async isPermissionActive(permissionId: number, roleId: number, trx = database): Promise<boolean> {
        try {
            const result = await trx
                .select()
                .from(rolePermissions)
                .where(
                    and(
                        eq(rolePermissions.permissionId, permissionId),
                        or(
                            isNull(rolePermissions.validTo),
                            gt(rolePermissions.validTo, nowInBerlin())
                        ),
                        eq(rolePermissions.roleId, roleId)
                    )
                )
                .limit(1);
            return result.length > 0;
        } catch (error) {
            console.error("Error checking if permission is active:", error);
            throw new Error("Error checking if permission is active");
        }
    }

    async getByName(name: string, trx = database): Promise<Permission | undefined> {
        const result = await trx
            .select()
            .from(permissions)
            .where(eq(permissions.name, name))
            .limit(1);
        return result[0];
    }



    //ONLY USED IN SEEDING
    async ensurePermissionsExist(): Promise<void> {
        for (const perm of defaultPermissions) {
            const existing = await this.getByName(perm.name);
            if (!existing) {
                await this.createPermission(perm.name, perm.description ?? undefined);
                console.log(`✅ Permission "${perm.name}" wurde angelegt.`);
            }
        }
    }

    async syncDefaultPermissions(trx = database): Promise<{ created: Permission[], existing: Permission[], total: number }> {
        const created: Permission[] = [];
        const existing: Permission[] = [];

        for (const perm of defaultPermissions) {
            const existingPerm = await this.getByName(perm.name, trx);
            if (!existingPerm) {
                const newPerm = await this.createPermission(perm.name, perm.description ?? undefined, trx);
                created.push(newPerm);
                console.log(`✅ Permission "${perm.name}" created during sync.`);
            } else {
                existing.push(existingPerm);
            }
        }

        return {
            created,
            existing,
            total: defaultPermissions.length
        };
    }







    async getAll(): Promise<Permission[]> {
        try {
            const result = await this.db
                .select()
                .from(permissions)
                .orderBy(asc(permissions.name));
            return result;
        } catch (error) {
            console.error("Error getting all permissions:", error);
            throw new Error("Error getting all permissions");
        }
    }


    async assignPermissionToRole(roleId: number, permissionId: number, assignedBy: number, trx = database): Promise<RolePermission> {
        try {
            const [result] = await trx
                .insert(rolePermissions)
                .values({ roleId, permissionId, createdAt: nowInBerlin(), assignedBy })
                .returning();
            return result;
        } catch (error) {
            console.error("Error assigning permission to role:", error);
            throw new Error("Error assigning permission to role");
        }
    }


    async unassignPermissionFromRole(roleId: number, permissionId: number, revokedBy: number, trx = database): Promise<void> {
        try {
            await trx
                .update(rolePermissions)
                .set({ validTo: nowInBerlin(), revokedBy })
                .where(
                    and(
                        eq(rolePermissions.roleId, roleId),
                        eq(rolePermissions.permissionId, permissionId),
                    )
                );
            return;
        } catch (error) {
            console.error("Error unassigning permission from role:", error);
            throw new Error("Error unassigning permission from role");
        }
    }



    async getRolePermissions(roleId: number, trx = database): Promise<Permission[]> {
        try {
            const result = await trx
                .select({
                    id: permissions.id,
                    name: permissions.name,
                    description: permissions.description,
                })
                .from(rolePermissions)
                .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
                .where(and(
                    eq(rolePermissions.roleId, roleId),
                    or(
                        isNull(rolePermissions.validTo),
                        gt(rolePermissions.validTo, nowInBerlin())
                    )
                ))


            return result;
        } catch (error) {
            console.error("Error getting permissions by role ID:", error);
            throw new Error("Error getting permissions by role ID");
        }
    }



    async getAssignments(trx = database): Promise<RolePermission[]> {
        try {
            const result = await trx
                .select()
                .from(rolePermissions)
            return result;
        } catch (error) {
            console.error("Error getting role permission assignments:", error);
            throw new Error("Error getting role permission assignments");
        }
    }

    async getAllRolePermissions(): Promise<RolePermission[]> {
        try {
            const result = await this.db
                .select()
                .from(rolePermissions)
                .orderBy(asc(rolePermissions.roleId), asc(rolePermissions.permissionId));
            return result;
        } catch (error) {
            console.error("Error getting all role permissions:", error);
            throw new Error("Error getting all role permissions");
        }
    }

    async getAllActiveRolePermissions(trx = database): Promise<RolePermission[]> {
        try {
            const now = nowInBerlin();

            const result = await trx
                .select()
                .from(rolePermissions)
                .where(
                    and(
                        lte(rolePermissions.createdAt, now),
                        or(
                            isNull(rolePermissions.validTo),
                            gt(rolePermissions.validTo, now)
                        )
                    )
                );

            return result;
        } catch (error) {
            console.error("Error getting all active role permissions:", error);
            throw new Error("Error getting all active role permissions");
        }
    }


    async getById(id: number, trx = database): Promise<Permission | undefined> {
        const result = await trx
            .select()
            .from(permissions)
            .where(eq(permissions.id, id))
            .limit(1);
        return result[0];
    }

}


export const permissionService = new PermissionService();
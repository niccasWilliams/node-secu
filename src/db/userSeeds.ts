import { DateTime } from "luxon";
import { database } from ".";
import { AppPermissions, AppPermissionValue, permissionService } from "../routes/auth/roles/permissions/permission.service";
import { roleAssignmentService } from "../routes/auth/roles/role-assignments/role-assignment.service";
import { roleService } from "../routes/auth/roles/roles/role.service";
import { userService } from "@/routes/auth/users/user/user.service";
import { settingsService } from "../routes/settings/settings.service";
import { nowInBerlin } from "@/util/utils";
import { User, UserInsert, users } from "@/db/schema"


// ADMIN USER SEEDS
// Customize this for each new app instance
const newUsers: UserInsert[] = [
    {
        externalUserId: "1",
        email: "niclaspilz@gmail.com",
        firstName: "Admin",
        lastName: "User",
        createdAt: nowInBerlin(),
    },
]

const adminRole = {
    name: "Admin",
    description: "Administrator role with full access",
};



const appAdminPermissions: AppPermissionValue[] = [
    AppPermissions.UsersManage,
    AppPermissions.UsersView,
    AppPermissions.SettingsEdit,
    AppPermissions.PermissionsManage,
    AppPermissions.RolesManage,
    AppPermissions.PermissionsHistoryView,
    AppPermissions.RolesHistoryView,

    AppPermissions.WebhookView,
    AppPermissions.WebhookDelete,

    AppPermissions.LogView,
    AppPermissions.LogDelete,
];







export async function seedUserLeads() {
    console.log("➡️ Seeding users...");

    let createdAdminUser: User | null = null;
    for (const user of newUsers) {
        const createdUser = await userService.createUser(
            user.externalUserId ? String(user.externalUserId) : undefined,
            user.email || undefined,
            user.firstName || undefined,
            user.lastName || undefined,
        );
        if (!createdUser || !createdUser.id) throw new Error("Failed to create user");
        // First user becomes admin
        if (!createdAdminUser) {
            createdAdminUser = createdUser;
        }
    }


    //APP CONFIG:
    await settingsService.ensureAppSettingsExist();
    await permissionService.ensurePermissionsExist();
    console.log("✅ App settings and permissions ensured.");


    // Create Admin Role
    const createdRole = await roleService.createRole(adminRole.name, adminRole.description);
    console.log(`✅ Created role: ${createdRole.name}`);


    // Assign permissions to Admin Role
    for (const permissionName of appAdminPermissions) {
        const permission = await permissionService.getByName(permissionName);
        if (!permission) {
            console.error(`❌ Permission ${permissionName} not found.`);
            continue;
        } else {
            console.log(`✅ Found permission: ${permission.name}`);
            await permissionService.assignPermissionToRole(createdRole.id, permission.id, 1);
        }
    }
    console.log(`✅ All permissions assigned to Admin role.`);



    // Assign Admin Role to first user
    if (createdAdminUser && createdAdminUser.id) {
        await roleAssignmentService.createRoleAssignment(createdAdminUser.id, createdRole.id, DateTime.now().setZone("Europe/Berlin"), 1);
        console.log(`✅ Assigned role "${createdRole.name}" to user ${createdAdminUser.email}`);
    } else {
        console.error("❌ No user found to assign the role.");
    }



    console.log(`✅ User leads seeded.`);
}
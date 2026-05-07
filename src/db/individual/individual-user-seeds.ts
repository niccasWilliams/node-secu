
import { User, Role } from "@/db/schema";
import { AppPermissions, AppPermissionValue, permissionService } from "@/routes/auth/roles/permissions/permission.service";
import { userService } from "@/routes/auth/users/user/user.service";
import { roleService } from "@/routes/auth/roles/roles/role.service";
import { roleAssignmentService } from "@/routes/auth/roles/role-assignments/role-assignment.service";
import { DateTime } from "luxon";


const individualUser: User[] = [


]

const individualRole = {
    name: "Individual",
    description: "Role for individual users with limited access",
    isSellable: false,
};


const baseAccessRole = {
    name: "Base Access",
    description: "Role for users with access to the application features",
    isSellable: true,
};

const premiumAccessRole = {
    name: "Premium Access",
    description: "Role for users with access to premium features",
    isSellable: true,
};

const enterpriseAccessRole = {
    name: "Enterprise Access",
    description: "Role for users with access to enterprise features",
    isSellable: true,
};


const appIndividualPermissions: AppPermissionValue[] = [



    // AppPermissions.DocumentsAccess,
    // AppPermissions.DocumentsManage,
    // AppPermissions.DocumentsAdmin,


    // AppPermissions.BookkeepingAccess,
    // AppPermissions.ManagingCompanyAdmin,

    // AppPermissions.WorkCreate,
    // AppPermissions.WorkValidate,

];


//BASE ROLE FOR USERS WHO BOUGTH APP ACCESS
const appBASEAcess: AppPermissionValue[] = [
   
];

const appPREMIUMAcess: AppPermissionValue[] = [
       //TODO: permium features, we handle this later via limits over managing companies usw.. 
];

const appENTERPRISEAcess: AppPermissionValue[] = [
    
    //TODO: permium features, we handle this later via limits over managing companies usw.. 
    //enterprice customers have to orequest individual sysrtem limits for their use cases, so we need something to controll it individual for every customer
    //best case is that teh shop controlls limits of products, so we can automate this and show it perfect in the shop
];


export async function individualUserSeed() {
    let createdIndividualUser: User | null = null;
    let createdRole: Role | null = null;

    for (const userData of individualUser) {
        const createdUser = await userService.createUser(
            userData.externalUserId ? String(userData.externalUserId) : undefined,
            userData.email || undefined,
            userData.firstName || undefined,
            userData.lastName || undefined,
        );
        createdIndividualUser = createdUser;
    }

    // Create Individual Role

    createdRole = await roleService.createRole(individualRole.name, individualRole.description, individualRole.isSellable);
    console.log(`✅ Created role: ${createdRole.name}`);

    // Assign permissions to Individual Role
    for (const permissionName of appIndividualPermissions) {
        const permission = await permissionService.getByName(permissionName.toString());
        if (!permission) {
            console.error(`❌ Permission ${permissionName} not found.`);
            continue;
        } else {
            console.log(`✅ Found permission: ${permission.name}`);
            await permissionService.assignPermissionToRole(createdRole.id, permission.id, 1);
        }

    }
    //to main admin user..
    await roleAssignmentService.createRoleAssignment(1, createdRole.id, DateTime.now().setZone("Europe/Berlin"), 1);

    // Assign Individual Role to first user
    if (createdIndividualUser && createdIndividualUser.id) {
        await roleAssignmentService.createRoleAssignment(createdIndividualUser.id, createdRole.id, DateTime.now().setZone("Europe/Berlin"), 1);

        console.log(`✅ Assigned role "${createdRole.name}" to user ${createdIndividualUser.email}`);
    } else {
        console.error("❌ No user found to assign the role.");
    }

    const userAccessRoleCreated = await roleService.createRole(baseAccessRole.name, baseAccessRole.description, baseAccessRole.isSellable);
    console.log(`✅ Created role: ${userAccessRoleCreated.name}`);

    for (const permissionName of appBASEAcess) {
        const permission = await permissionService.getByName(permissionName.toString());
        if (!permission) {
            console.error(`❌ Permission ${permissionName} not found.`);
            continue;
        } else {
            console.log(`✅ Found permission: ${permission.name}`);
            await permissionService.assignPermissionToRole(userAccessRoleCreated.id, permission.id, 1);
        }

    }
    //to main admin user..
    await roleAssignmentService.createRoleAssignment(1, userAccessRoleCreated.id, DateTime.now().setZone("Europe/Berlin"), 1);



    const userPremiumAccessRoleCreated = await roleService.createRole(premiumAccessRole.name, premiumAccessRole.description, premiumAccessRole.isSellable);
    console.log(`✅ Created role: ${userPremiumAccessRoleCreated.name}`);

    for (const permissionName of appPREMIUMAcess) {
        const permission = await permissionService.getByName(permissionName.toString());
        if (!permission) {
            console.error(`❌ Permission ${permissionName} not found.`);
            continue;
        } else {
            console.log(`✅ Found permission: ${permission.name}`);
            await permissionService.assignPermissionToRole(userPremiumAccessRoleCreated.id, permission.id, 1);
        }
    }



    const userEnterpriseAccessRoleCreated = await roleService.createRole(enterpriseAccessRole.name, enterpriseAccessRole.description, enterpriseAccessRole.isSellable);
    console.log(`✅ Created role: ${userEnterpriseAccessRoleCreated.name}`);

    for (const permissionName of appENTERPRISEAcess) {
        const permission = await permissionService.getByName(permissionName.toString());
        if (!permission) {
            console.error(`❌ Permission ${permissionName} not found.`);
            continue;
        } else {
            console.log(`✅ Found permission: ${permission.name}`);
            await permissionService.assignPermissionToRole(userEnterpriseAccessRoleCreated.id, permission.id, 1);
        }
    }


    console.log(`✅ Individual USER leads seeded.`);
}
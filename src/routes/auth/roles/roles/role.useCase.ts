import { DateTime } from "luxon";
import { eq, and, inArray, or, sql, ilike, asc, desc } from "drizzle-orm";
import { database } from "@/db";
import { Permission, permissions, Role, roleAssignments, rolePermissions, roles, User, users } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { roleService } from "./role.service";
import { roleAssignmentService } from "../role-assignments/role-assignment.service";
import { permissionService } from "../permissions/permission.service";


class RoleUseCase {
   



   


}

export const roleUseCase = new RoleUseCase();
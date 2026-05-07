import { DateTime } from "luxon";
import { eq, and, inArray, or, sql, ilike, asc, desc, lt, gte, lte, isNull, isNotNull, gt } from "drizzle-orm";
import { database } from "@/db";
import {  RoleAssignment, roleAssignments, RoleAssignmentStatus, UserId,  } from "@/db/schema";
import { addMinutes, nowInBerlin } from "@/util/utils";


class RoleAssignmentService {
    private db;

    constructor() {
        this.db = database;
    }





    async createRoleAssignment(userId: UserId, roleId: number, validFrom: DateTime, assignedBy: UserId, trx = database): Promise<RoleAssignment> {
        return await this.createRoleAssignmentWithValidity(userId, roleId, validFrom, null, assignedBy, trx);
    }

    async createRoleAssignmentWithValidity(
        userId: UserId,
        roleId: number,
        validFrom: DateTime,
        validTo: Date | null,
        assignedBy: UserId,
        trx = database
    ): Promise<RoleAssignment> {
        try {
            const now = nowInBerlin();
            const finalStatus: RoleAssignmentStatus = validTo && validTo <= now ? "expired" : "active";

            const [created] = await trx
                .insert(roleAssignments)
                .values({
                    roleId,
                    userId,
                    assignedBy,
                    createdAt: now,
                    validFrom: validFrom.toJSDate(),
                    validTo: validTo ?? null,
                    status: finalStatus,
                })
                .returning();
            return created;
        } catch (error) {
            console.error("Error assigning user to role:", error);
            throw new Error("Error assigning user to role");
        }
    }




    async revokeUserFromRole(userId: number, roleId: number, revokedBy: UserId, trx = database): Promise<void> {
        try {
            await trx
                .update(roleAssignments)
                .set({ validTo: nowInBerlin(), status: "revoked", revokedBy })
                .where(
                    and(
                        eq(roleAssignments.userId, userId),
                        eq(roleAssignments.roleId, roleId),
                    )
                );
        } catch (error) {
            console.error("Error invalidating user role:", error);
            throw new Error("Error invalidating user role");
        }
    }


    async getAllRoleAssignments(trx = database) {
        try {
            const assignments = await trx
                .select()
                .from(roleAssignments);
            return assignments;
        } catch (error) {
            console.error("Error fetching all role assignments:", error);
            throw new Error("Error fetching all role assignments");
        }
    }


    async getUserRoleAssignments(userId: number, trx = database): Promise<RoleAssignment[]> {
        try {
            const now = nowInBerlin();

            const assignments = await trx
                .select()
                .from(roleAssignments)
                .where(
                    and(
                        eq(roleAssignments.userId, userId),
                        eq(roleAssignments.status, "active"),
                        lte(roleAssignments.validFrom, now),
                        or(
                            isNull(roleAssignments.validTo), 
                            gt(roleAssignments.validTo, now)
                        )
                    )
                )
                .orderBy(asc(roleAssignments.validFrom));

            return assignments;
        } catch (error) {
            console.error("Error fetching user role assignments:", error);
            throw new Error("Error fetching user role assignments");
        }
    }

    async getActiveOrUpcomingUserRoleAssignment(userId: number, roleId: number, trx = database): Promise<RoleAssignment | null> {
        try {
            const now = nowInBerlin();
            const [assignment] = await trx
                .select()
                .from(roleAssignments)
                .where(
                    and(
                        eq(roleAssignments.userId, userId),
                        eq(roleAssignments.roleId, roleId),
                        eq(roleAssignments.status, "active"),
                        or(
                            isNull(roleAssignments.validTo),
                            gt(roleAssignments.validTo, now)
                        )
                    )
                )
                .orderBy(desc(roleAssignments.validFrom))
                .limit(1);

            return assignment ?? null;
        } catch (error) {
            console.error("Error fetching active/upcoming user role assignment:", error);
            throw new Error("Error fetching user role assignment");
        }
    }

    /**
     * Finds a recently expired role assignment within a grace period.
     * Used during subscription renewals to extend the existing assignment
     * instead of creating a duplicate, even if the old one has technically expired
     * (e.g., Stripe webhook arrives 30-60s after period end).
     *
     * Only finds assignments with status="active" that have a non-null validTo
     * in the recent past. Does NOT find revoked assignments.
     */
    async getRecentlyExpiredUserRoleAssignment(
        userId: number,
        roleId: number,
        gracePeriodHours: number = 24,
        trx = database
    ): Promise<RoleAssignment | null> {
        try {
            const now = nowInBerlin();
            const graceStart = new Date(now.getTime() - gracePeriodHours * 60 * 60 * 1000);

            const [assignment] = await trx
                .select()
                .from(roleAssignments)
                .where(
                    and(
                        eq(roleAssignments.userId, userId),
                        eq(roleAssignments.roleId, roleId),
                        eq(roleAssignments.status, "active"),
                        isNotNull(roleAssignments.validTo),
                        gt(roleAssignments.validTo, graceStart),
                        lte(roleAssignments.validTo, now)
                    )
                )
                .orderBy(desc(roleAssignments.validTo))
                .limit(1);

            return assignment ?? null;
        } catch (error) {
            console.error("Error fetching recently expired user role assignment:", error);
            throw new Error("Error fetching recently expired user role assignment");
        }
    }

    async updateRoleAssignmentValidity(
        assignmentId: number,
        updates: { validFrom: Date; validTo: Date | null },
        trx = database
    ): Promise<RoleAssignment> {
        try {
            const now = nowInBerlin();
            const status: RoleAssignmentStatus = updates.validTo && updates.validTo <= now ? "expired" : "active";
            const [updated] = await trx
                .update(roleAssignments)
                .set({
                    validFrom: updates.validFrom,
                    validTo: updates.validTo,
                    status,
                })
                .where(eq(roleAssignments.id, assignmentId))
                .returning();

            if (!updated) throw new Error(`Role assignment ${assignmentId} not found`);
            return updated;
        } catch (error) {
            console.error("Error updating role assignment validity:", error);
            throw new Error("Error updating role assignment validity");
        }
    }



}

export const roleAssignmentService = new RoleAssignmentService();


import { eq, inArray, or, ilike, desc, count, sql } from "drizzle-orm";
import { database } from "@/db";
import { User, UserId, users } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { PaginatedResult } from "@/types/types";


class UserService {



    async createUser(externalUserId?: string, email?: string, firstName?: string, lastName?: string, trx = database): Promise<User> {
        // Ensure one transaction scope for the whole read/update/insert flow.
        // This enables advisory locks to effectively serialize same externalUserId creations.
        if (trx === database) {
            return database.transaction(async (tx) => {
                return this.createUser(externalUserId, email, firstName, lastName, tx as any);
            });
        }

        try {
            const normalizedExternalUserId = externalUserId?.toString().trim() || undefined;
            const normalizedEmail = email?.trim() || undefined;
            const normalizedFirstName = firstName?.trim() || undefined;
            const normalizedLastName = lastName?.trim() || undefined;

            if (!normalizedExternalUserId && !normalizedEmail && !normalizedFirstName && !normalizedLastName) {
                throw new Error("❌ Missing at least one required field: externalUserId, email, firstName, or lastName");
            }

            // Cross-instance race protection by external user id.
            if (normalizedExternalUserId) {
                await trx.execute(sql`select pg_advisory_xact_lock(hashtext(${normalizedExternalUserId}))`);
            }

            // Check if user with this email already exists
            if (normalizedEmail) {
                const existingUser = await this.getUserByEmail(normalizedEmail, trx);
                if (existingUser && existingUser.id) {
                    console.log(`✅ User with email ${normalizedEmail} already exists. Updating data instead of creating duplicate.`);
                    // Update existing user's data if provided
                    const updateData: Partial<User> = {};
                    if (normalizedFirstName) updateData.firstName = normalizedFirstName;
                    if (normalizedLastName) updateData.lastName = normalizedLastName;
                    if (normalizedExternalUserId) updateData.externalUserId = normalizedExternalUserId;

                    if (Object.keys(updateData).length > 0) {
                        const [updatedUser] = await trx
                            .update(users)
                            .set(updateData)
                            .where(eq(users.id, existingUser.id))
                            .returning();
                        return updatedUser;
                    }

                    return existingUser;
                }
            }

            // Check if user with this externalUserId already exists
            if (normalizedExternalUserId) {
                const existingUserByExtId = await trx
                    .select()
                    .from(users)
                    .where(eq(users.externalUserId, normalizedExternalUserId))
                    .limit(1);

                if (existingUserByExtId.length > 0) {
                    const existingUser = existingUserByExtId[0];
                    if (existingUser && existingUser.id) {
                        console.log(`✅ User with externalUserId ${normalizedExternalUserId} already exists. Updating name instead of creating duplicate.`);

                        // Update existing user's name if provided
                        const updateData: Partial<User> = {};
                        if (normalizedFirstName) updateData.firstName = normalizedFirstName;
                        if (normalizedLastName) updateData.lastName = normalizedLastName;
                        if (normalizedEmail) updateData.email = normalizedEmail;

                        if (Object.keys(updateData).length > 0) {
                            const [updatedUser] = await trx
                                .update(users)
                                .set(updateData)
                                .where(eq(users.id, existingUser.id))
                                .returning();
                            return updatedUser;
                        }

                        return existingUser;
                    }
                }
            }

            // No existing user found, create new one
            const [result] = await trx
                .insert(users)
                .values({
                    externalUserId: normalizedExternalUserId,
                    email: normalizedEmail,
                    firstName: normalizedFirstName,
                    lastName: normalizedLastName,
                    createdAt: nowInBerlin(),
                })
                .returning();
            return result;
        } catch (error) {
            console.error("Error creating user:", error);
            throw new Error("Error creating user");
        }

    }

    async deleteUser(userId: number, trx = database): Promise<User | undefined> {
        try {
            const [result] = await trx
                .delete(users)
                .where(eq(users.id, userId))
                .returning();
            return result;
        } catch (error) {
            console.error("Error deleting user:", error);
            throw new Error("Error deleting user");
        }
    }

    async deleteUserByFrontendUserId(frontendUserId: string, trx = database): Promise<User | undefined> {
        try {
            const [result] = await trx
                .delete(users)
                .where(eq(users.externalUserId, frontendUserId))
                .returning();
            return result;
        } catch (error) {
            console.error("Error deleting user:", error);
            throw new Error("Error deleting user");
        }
    }




    async getUserById(userId: number, trx = database): Promise<User | undefined> {
        try {
            const [result] = await trx
                .select()
                .from(users)
                .where(eq(users.id, userId));
            return result;
        } catch (error) {
            console.error("Error getting user by ID:", error);
            throw new Error("Error getting user by ID");
        }
    }

    async getUserByEmail(email: string, trx = database): Promise<User | undefined> {
        try {
            const [result] = await trx
                .select()
                .from(users)
                .where(eq(users.email, email));
            return result;
        } catch (error) {
            console.error("Error getting user by email:", error);
            throw new Error("Error getting user by email");
        }
    }

    async getUserByExternalUserId(externalUserId: number | string, trx = database): Promise<User | undefined> {
        try {
            const userId = externalUserId.toString();
            const [result] = await trx
                .select()
                .from(users)
                .where(eq(users.externalUserId, userId));
            return result;
        } catch (error) {
            console.error("Error getting user by external user ID:", error);
            throw new Error("Error getting user by external user ID");
        }
    }

    async getAllUsers(trx = database): Promise<User[]> {
        try {
            const result = await trx
                .select()
                .from(users);
            return result;
        } catch (error) {
            console.error("Error getting all users:", error);
            throw new Error("Error getting all users");
        }
    }








    async updateUserByFrontendUserId(frontendUserId: string, user: Partial<User>, trx = database): Promise<User> {
        try {
            const [result] = await trx
                .update(users)
                .set({ ...user, updatedAt: nowInBerlin() })
                .where(eq(users.externalUserId, frontendUserId))
                .returning();
            return result;
        } catch (error) {
            console.error("Error updating user:", error);
            throw new Error("Error updating user");
        }
    }

   
   async getUsersByIds(userIds: number[], trx = database): Promise<User[]> {
        try {
            const result = await trx
                .select()
                .from(users)
                .where(inArray(users.id, userIds));
            return result;
        } catch (error) {
            console.error("Error getting users by IDs:", error);
            throw new Error("Error getting users by IDs");
        }    
    }

    async searchUsers(
        search: string | undefined,
        page: number = 1,
        pageSize: number = 20,
        trx = database,
    ): Promise<PaginatedResult<User>> {
        const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
        const normalizedPageSize = Math.min(Math.max(Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 20, 1), 100);
        const offset = (safePage - 1) * normalizedPageSize;

        const likeTerm = search?.trim() ? `%${search.trim()}%` : undefined;
        const condition = likeTerm
            ? or(
                ilike(users.email, likeTerm),
                ilike(users.firstName, likeTerm),
                ilike(users.lastName, likeTerm),
                ilike(users.externalUserId, likeTerm),
            )
            : undefined;

        const totalQuery = trx.select({ total: count() }).from(users);
        if (condition) {
            totalQuery.where(condition);
        }
        const [{ total }] = await totalQuery;
        const totalNumber = typeof total === "bigint" ? Number(total) : Number(total ?? 0);

        const dataQuery = trx
            .select()
            .from(users)
            .orderBy(desc(users.createdAt))
            .limit(normalizedPageSize)
            .offset(offset);
        if (condition) {
            dataQuery.where(condition);
        }
        const rows = await dataQuery;

        const totalPages = totalNumber === 0 ? 0 : Math.ceil(totalNumber / normalizedPageSize);

        return {
            items: rows,
            page: safePage,
            pageSize: normalizedPageSize,
            total: totalNumber,
            totalPages,
            hasNextPage: safePage < totalPages,
            hasPrevPage: safePage > 1 && totalPages > 0,
        };
    }
   

    


}

export const userService = new UserService();

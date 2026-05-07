/**
 * Entitlement UseCase
 *
 * Standalone business logic for the entitlements API.
 * Maps sellable roles to external entitlements for shop sync.
 */

import { APP_ID } from "@/app.config";
import { roleService } from "@/routes/auth/roles/roles/role.service";
import { roleAssignmentService } from "@/routes/auth/roles/role-assignments/role-assignment.service";
import { userService } from "@/routes/auth/users/user/user.service";
import { userUseCase } from "@/routes/auth/users/user/user.useCase";
import { oauth2ClientService } from "@/routes/oauth2/oauth2-client.service";
import { logService } from "@/routes/log-service/log-service.service";
import { DateTime } from "luxon";
import { entitlementSyncContextService, ShopEntitlementSyncContext } from "./entitlement-sync-context.service";

export class EntitlementNotFoundError extends Error {}
export class EntitlementValidationError extends Error {}

type EntitlementType = "role" | "area";

type EntitlementLogLevel = "warn" | "error";

export class EntitlementUseCase {
    private readonly logThrottleMs = 5 * 60 * 1000;
    private readonly throttledLogState = new Map<string, { lastLoggedAt: number; suppressedCount: number }>();

    private async logThrottled(
        level: EntitlementLogLevel,
        key: string,
        message: string,
        context: Record<string, unknown>
    ): Promise<void> {
        const now = Date.now();
        const state = this.throttledLogState.get(key);
        if (state && now - state.lastLoggedAt < this.logThrottleMs) {
            state.suppressedCount += 1;
            this.throttledLogState.set(key, state);
            return;
        }

        const suppressedCount = state?.suppressedCount ?? 0;
        this.throttledLogState.set(key, { lastLoggedAt: now, suppressedCount: 0 });

        const payload = suppressedCount > 0
            ? { ...context, suppressedCountSinceLastLog: suppressedCount }
            : context;

        if (level === "warn") {
            await logService.warn(message, payload);
            return;
        }

        await logService.error(message, payload);
    }

    private async ensureLocalUserByExternalUserId(externalUserId: string): Promise<number> {
        const existing = await userService.getUserByExternalUserId(externalUserId);
        if (existing?.id) return existing.id;

        try {
            const createdFromExternal = await userUseCase.createExternalUser(externalUserId);
            if (createdFromExternal?.id) return createdFromExternal.id;
        } catch (error) {
            await this.logThrottled("warn", "entitlement.ensure_user.external_create_failed", "Failed to create local user from frontend data for entitlement flow, using fallback", {
                externalUserId,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        const created = await userService.createUser(externalUserId);
        if (!created?.id) {
            await this.logThrottled("error", "entitlement.ensure_user.fallback_create_failed", "Fallback local user creation failed in entitlement flow", {
                externalUserId,
            });
            throw new Error(`Failed to ensure local user for externalUserId ${externalUserId}`);
        }
        return created.id;
    }

    private async getLocalUserIdByExternalUserId(externalUserId: string): Promise<number | null> {
        const existing = await userService.getUserByExternalUserId(externalUserId);
        return existing?.id ?? null;
    }

    private async getSellableRoles() {
        const allRoles = await roleService.getAllRoles();
        return allRoles.filter((r) => r.isSellable);
    }

    private toExternalEntitlement(role: { name: string; description: string | null }) {
        return {
            externalIdentifier: role.name,
            entitlementType: "role" as const,
            externalName: role.name,
            externalDescription: role.description ?? null,
        };
    }

    private async resolveSellableRoleByExternalIdentifier(
        externalIdentifier: string,
        entitlementType: EntitlementType
    ) {
        if (entitlementType !== "role") {
            throw new EntitlementNotFoundError(
                `Entitlement type '${entitlementType}' is currently not configured in this app`
            );
        }

        const sellableRoles = await this.getSellableRoles();
        const role = sellableRoles.find(
            (r) => r.name === externalIdentifier || String(r.id) === externalIdentifier
        );
        if (!role) {
            throw new EntitlementNotFoundError(`Entitlement '${externalIdentifier}' not found`);
        }
        return role;
    }

    private async resolveAssignedByUserId(
        sourceClientId: string | undefined,
        fallbackUserId: number
    ): Promise<number> {
        if (!sourceClientId) return fallbackUserId;
        try {
            const client = await oauth2ClientService.getOAuth2ClientByClientId(sourceClientId);
            if (client?.createdBy) return client.createdBy;
        } catch (error) {
            console.error("Failed to resolve OAuth2 client creator for entitlement assignment:", error);
        }
        return fallbackUserId;
    }

    async getEntitlements() {
        const sellableRoles = await this.getSellableRoles();
        const data = sellableRoles.map((role) => this.toExternalEntitlement(role));

        return {
            app: { appId: APP_ID },
            data,
            total: data.length,
        };
    }

    async getEntitlementDetail(roleId: number) {
        const role = await roleService.getRoleById(roleId);
        if (!role || !role.isSellable) {
            throw new EntitlementNotFoundError(`Entitlement ${roleId} not found`);
        }

        const perms = await roleService.getRolePermissions(role.id);
        return { ...role, permissions: perms };
    }

    async getAssignedEntitlements(filters?: { userId?: string }) {
        const sellableRoleIds = new Set((await this.getSellableRoles()).map((r) => r.id));

        let assignments;
        if (filters?.userId) {
            const localUserId = await this.ensureLocalUserByExternalUserId(filters.userId);
            assignments = await roleAssignmentService.getUserRoleAssignments(localUserId);
        } else {
            assignments = await roleAssignmentService.getAllRoleAssignments();
        }

        const filtered = assignments.filter((a) => sellableRoleIds.has(a.roleId));

        return {
            data: filtered,
            total: filtered.length,
        };
    }

    async getUserEntitlements(externalUserId: string) {
        const localUserId = await this.ensureLocalUserByExternalUserId(externalUserId);
        const sellableRoleIds = new Set((await this.getSellableRoles()).map((r) => r.id));
        const activeRoles = await roleService.getActiveUserRolesWithHierarchy(localUserId);

        const sellableActiveRoles = activeRoles.filter((r) => sellableRoleIds.has(r.id));

        const rolesWithPermissions = await Promise.all(
            sellableActiveRoles.map(async (role) => {
                const perms = await roleService.getRolePermissions(role.id);
                return { ...role, permissions: perms };
            })
        );

        return {
            data: rolesWithPermissions,
            total: rolesWithPermissions.length,
        };
    }

    async assignEntitlement(input: {
        externalUserId: string;
        externalIdentifier: string;
        entitlementType: EntitlementType;
        validFrom?: Date | null;
        expiresAt?: Date | null;
        sourceClientId?: string;
        shopContext?: ShopEntitlementSyncContext;
    }) {
        const role = await this.resolveSellableRoleByExternalIdentifier(
            input.externalIdentifier,
            input.entitlementType
        );

        const localUserId = await this.ensureLocalUserByExternalUserId(input.externalUserId);
        const assignedBy = await this.resolveAssignedByUserId(input.sourceClientId, localUserId);
        const existing = await roleAssignmentService.getActiveOrUpcomingUserRoleAssignment(localUserId, role.id);

        // Grace Period: If no active assignment exists, check for one that expired recently
        // (e.g., Stripe renewal webhook arrives 30-60s after the subscription period ends).
        // This prevents creating duplicate role assignments on every renewal.
        const target = existing
            ?? await roleAssignmentService.getRecentlyExpiredUserRoleAssignment(localUserId, role.id, 24);

        const normalizedValidFrom = input.validFrom ?? new Date();
        if (Number.isNaN(normalizedValidFrom.getTime())) {
            throw new EntitlementValidationError("Invalid validFrom date");
        }
        if (input.expiresAt && Number.isNaN(input.expiresAt.getTime())) {
            throw new EntitlementValidationError("Invalid expiresAt date");
        }

        if (target) {
            const updated = await roleAssignmentService.updateRoleAssignmentValidity(
                target.id,
                {
                    validFrom: normalizedValidFrom,
                    validTo: input.expiresAt ?? null,
                }
            );

            await entitlementSyncContextService.upsertContext({
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: input.entitlementType,
                operation: "assign",
                userId: localUserId,
                roleId: role.id,
                roleAssignmentId: updated.id,
                validFrom: updated.validFrom,
                expiresAt: updated.validTo ?? null,
                isActive: updated.status === "active",
                sourceClientId: input.sourceClientId,
                shopContext: input.shopContext,
            });

            return {
                created: false,
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: "role" as const,
                validFrom: updated.validFrom,
                expiresAt: updated.validTo ?? null,
            };
        }

        const created = await roleAssignmentService.createRoleAssignmentWithValidity(
            localUserId,
            role.id,
            DateTime.fromJSDate(normalizedValidFrom),
            input.expiresAt ?? null,
            assignedBy
        );

        await entitlementSyncContextService.upsertContext({
            externalUserId: input.externalUserId,
            externalIdentifier: role.name,
            entitlementType: input.entitlementType,
            operation: "assign",
            userId: localUserId,
            roleId: role.id,
            roleAssignmentId: created.id,
            validFrom: created.validFrom,
            expiresAt: created.validTo ?? null,
            isActive: created.status === "active",
            sourceClientId: input.sourceClientId,
            shopContext: input.shopContext,
        });

        return {
            created: true,
            externalUserId: input.externalUserId,
            externalIdentifier: role.name,
            entitlementType: "role" as const,
            validFrom: created.validFrom,
            expiresAt: created.validTo ?? null,
        };
    }

    async getEntitlementState(input: {
        externalUserId: string;
        externalIdentifier: string;
        entitlementType: EntitlementType;
        sourceClientId?: string;
        shopContext?: ShopEntitlementSyncContext;
    }) {
        const role = await this.resolveSellableRoleByExternalIdentifier(
            input.externalIdentifier,
            input.entitlementType
        );
        const localUserId = await this.getLocalUserIdByExternalUserId(input.externalUserId);
        if (!localUserId) {
            await entitlementSyncContextService.upsertContext({
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: input.entitlementType,
                operation: "state_check",
                userId: null,
                roleId: role.id,
                roleAssignmentId: null,
                validFrom: null,
                expiresAt: null,
                isActive: false,
                sourceClientId: input.sourceClientId,
                shopContext: input.shopContext,
            });
            return null;
        }

        const assignment = await roleAssignmentService.getActiveOrUpcomingUserRoleAssignment(
            localUserId,
            role.id
        );
        if (!assignment) {
            await entitlementSyncContextService.upsertContext({
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: input.entitlementType,
                operation: "state_check",
                userId: localUserId,
                roleId: role.id,
                roleAssignmentId: null,
                validFrom: null,
                expiresAt: null,
                isActive: false,
                sourceClientId: input.sourceClientId,
                shopContext: input.shopContext,
            });
            return null;
        }

        const contextLink = await entitlementSyncContextService.upsertContext({
            externalUserId: input.externalUserId,
            externalIdentifier: role.name,
            entitlementType: input.entitlementType,
            operation: "state_check",
            userId: localUserId,
            roleId: role.id,
            roleAssignmentId: assignment.id,
            validFrom: assignment.validFrom,
            expiresAt: assignment.validTo ?? null,
            isActive: assignment.status === "active",
            sourceClientId: input.sourceClientId,
            shopContext: input.shopContext,
        });

        return {
            externalUserId: input.externalUserId,
            externalIdentifier: role.name,
            entitlementType: "role" as const,
            validFrom: assignment.validFrom,
            expiresAt: assignment.validTo ?? null,
            context: {
                shopAssignmentId: contextLink.shopAssignmentId ?? null,
                shopEntitlementId: contextLink.shopEntitlementId ?? null,
                shopCustomerId: contextLink.shopCustomerId ?? null,
                shopOrderId: contextLink.shopOrderId ?? null,
                shopOrderItemId: contextLink.shopOrderItemId ?? null,
            },
        };
    }

    async updateEntitlement(input: {
        externalUserId: string;
        externalIdentifier: string;
        entitlementType: EntitlementType;
        validFrom?: Date | null;
        expiresAt?: Date | null;
        sourceClientId?: string;
        shopContext?: ShopEntitlementSyncContext;
    }) {
        const role = await this.resolveSellableRoleByExternalIdentifier(
            input.externalIdentifier,
            input.entitlementType
        );

        const localUserId = await this.ensureLocalUserByExternalUserId(input.externalUserId);
        const assignedBy = await this.resolveAssignedByUserId(input.sourceClientId, localUserId);
        const existing = await roleAssignmentService.getActiveOrUpcomingUserRoleAssignment(localUserId, role.id);

        // Grace Period: extend recently expired assignment instead of creating a duplicate
        const target = existing
            ?? await roleAssignmentService.getRecentlyExpiredUserRoleAssignment(localUserId, role.id, 24);

        const now = new Date();
        const validFrom = input.validFrom === undefined
            ? (target?.validFrom ?? now)
            : (input.validFrom ?? now);
        if (Number.isNaN(validFrom.getTime())) {
            throw new EntitlementValidationError("Invalid validFrom date");
        }

        const expiresAt = input.expiresAt === undefined
            ? (target?.validTo ?? null)
            : input.expiresAt;
        if (expiresAt && Number.isNaN(expiresAt.getTime())) {
            throw new EntitlementValidationError("Invalid expiresAt date");
        }

        if (target) {
            const updated = await roleAssignmentService.updateRoleAssignmentValidity(target.id, {
                validFrom,
                validTo: expiresAt,
            });

            await entitlementSyncContextService.upsertContext({
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: input.entitlementType,
                operation: "update",
                userId: localUserId,
                roleId: role.id,
                roleAssignmentId: updated.id,
                validFrom: updated.validFrom,
                expiresAt: updated.validTo ?? null,
                isActive: updated.status === "active",
                sourceClientId: input.sourceClientId,
                shopContext: input.shopContext,
            });

            return {
                success: true,
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: "role" as const,
                validFrom: updated.validFrom,
                expiresAt: updated.validTo ?? null,
            };
        }

        const created = await roleAssignmentService.createRoleAssignmentWithValidity(
            localUserId,
            role.id,
            DateTime.fromJSDate(validFrom),
            expiresAt,
            assignedBy
        );

        await entitlementSyncContextService.upsertContext({
            externalUserId: input.externalUserId,
            externalIdentifier: role.name,
            entitlementType: input.entitlementType,
            operation: "update",
            userId: localUserId,
            roleId: role.id,
            roleAssignmentId: created.id,
            validFrom: created.validFrom,
            expiresAt: created.validTo ?? null,
            isActive: created.status === "active",
            sourceClientId: input.sourceClientId,
            shopContext: input.shopContext,
        });

        return {
            success: true,
            externalUserId: input.externalUserId,
            externalIdentifier: role.name,
            entitlementType: "role" as const,
            validFrom: created.validFrom,
            expiresAt: created.validTo ?? null,
        };
    }

    async revokeEntitlement(input: {
        externalUserId: string;
        externalIdentifier: string;
        entitlementType: EntitlementType;
        sourceClientId?: string;
        shopContext?: ShopEntitlementSyncContext;
    }) {
        const role = await this.resolveSellableRoleByExternalIdentifier(
            input.externalIdentifier,
            input.entitlementType
        );
        const localUserId = await this.getLocalUserIdByExternalUserId(input.externalUserId);
        if (!localUserId) {
            await entitlementSyncContextService.upsertContext({
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: input.entitlementType,
                operation: "revoke",
                userId: null,
                roleId: role.id,
                roleAssignmentId: null,
                validFrom: null,
                expiresAt: null,
                revokedAt: new Date(),
                isActive: false,
                sourceClientId: input.sourceClientId,
                shopContext: input.shopContext,
            });
            return { success: true, revoked: false };
        }

        const existing = await roleAssignmentService.getActiveOrUpcomingUserRoleAssignment(localUserId, role.id);
        if (!existing) {
            await entitlementSyncContextService.upsertContext({
                externalUserId: input.externalUserId,
                externalIdentifier: role.name,
                entitlementType: input.entitlementType,
                operation: "revoke",
                userId: localUserId,
                roleId: role.id,
                roleAssignmentId: null,
                validFrom: null,
                expiresAt: null,
                revokedAt: new Date(),
                isActive: false,
                sourceClientId: input.sourceClientId,
                shopContext: input.shopContext,
            });
            return { success: true, revoked: false };
        }

        const revokedBy = await this.resolveAssignedByUserId(input.sourceClientId, localUserId);
        const now = new Date();
        await roleAssignmentService.revokeUserFromRole(localUserId, role.id, revokedBy);
        await entitlementSyncContextService.upsertContext({
            externalUserId: input.externalUserId,
            externalIdentifier: role.name,
            entitlementType: input.entitlementType,
            operation: "revoke",
            userId: localUserId,
            roleId: role.id,
            roleAssignmentId: existing.id,
            validFrom: existing.validFrom,
            expiresAt: now,
            revokedAt: now,
            isActive: false,
            sourceClientId: input.sourceClientId,
            shopContext: input.shopContext,
        });
        return { success: true, revoked: true };
    }
}

export const entitlementUseCase = new EntitlementUseCase();

import { User } from "@/db/schema";
import { sendToFrontendAPIGet } from "@/lib/communication";
import { FrontendUser } from "@/types/types";
import { userService } from "./user.service";
import { logService } from "@/routes/log-service/log-service.service";

type FrontendUserLike = {
    id?: unknown;
    externalUserId?: unknown;
    external_user_id?: unknown;
    email?: unknown;
    firstName?: unknown;
    first_name?: unknown;
    lastName?: unknown;
    last_name?: unknown;
};

type ThrottledLogLevel = "warn" | "error" | "critical";

class UserUseCase {
    private readonly logThrottleMs = 5 * 60 * 1000;
    private readonly throttledLogState = new Map<string, { lastLoggedAt: number; suppressedCount: number }>();

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    private normalizeString(value: unknown): string | null {
        if (typeof value !== "string") return null;
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    }

    private normalizeExternalUserId(value: unknown): string | null {
        if (typeof value === "number" && Number.isFinite(value)) {
            const normalized = String(Math.trunc(value)).trim();
            return normalized.length > 0 ? normalized : null;
        }
        return this.normalizeString(value);
    }

    private normalizeOptionalText(value: unknown): string | null {
        if (value === null || value === undefined) return null;
        return this.normalizeString(value);
    }

    private externalUserIdsMatch(requested: string, received: string): boolean {
        if (requested === received) return true;

        const digitPattern = /^\d+$/;
        if (digitPattern.test(requested) && digitPattern.test(received)) {
            try {
                return BigInt(requested) === BigInt(received);
            } catch {
                return false;
            }
        }
        return false;
    }

    private async logThrottled(
        level: ThrottledLogLevel,
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

        if (level === "critical") {
            await logService.critical(message, payload);
            return;
        }

        await logService.error(message, payload);
    }

    private extractUserPayload(rawPayload: unknown): FrontendUserLike | null {
        if (!this.isRecord(rawPayload)) return null;

        // 1) observed live shape: { id, email, firstName, lastName }
        if ("id" in rawPayload || "externalUserId" in rawPayload || "external_user_id" in rawPayload) {
            return rawPayload as FrontendUserLike;
        }

        // 2) common envelope: { success, data: { ... } } or { success, data: { data: { ... } } }
        if ("data" in rawPayload && this.isRecord(rawPayload.data)) {
            const dataCandidate = rawPayload.data as Record<string, unknown>;
            if ("id" in dataCandidate || "externalUserId" in dataCandidate || "external_user_id" in dataCandidate) {
                return dataCandidate as FrontendUserLike;
            }

            if ("data" in dataCandidate && this.isRecord(dataCandidate.data)) {
                const nested = dataCandidate.data as Record<string, unknown>;
                if ("id" in nested || "externalUserId" in nested || "external_user_id" in nested) {
                    return nested as FrontendUserLike;
                }
            }

            if ("user" in dataCandidate && this.isRecord(dataCandidate.user)) {
                const nested = dataCandidate.user as Record<string, unknown>;
                if ("id" in nested || "externalUserId" in nested || "external_user_id" in nested) {
                    return nested as FrontendUserLike;
                }
            }
        }

        // 3) alternative envelope: { user: { ... } }
        if ("user" in rawPayload && this.isRecord(rawPayload.user)) {
            const userCandidate = rawPayload.user as Record<string, unknown>;
            if ("id" in userCandidate || "externalUserId" in userCandidate || "external_user_id" in userCandidate) {
                return userCandidate as FrontendUserLike;
            }
        }

        return null;
    }

    async getExternalUserByExternalUserId(externalUserId: string): Promise<FrontendUser | null> {
        const requestedExternalUserId = this.normalizeExternalUserId(externalUserId);
        if (!requestedExternalUserId) {
            await this.logThrottled("warn", "frontend_user.invalid_requested_external_user_id", "Invalid externalUserId for frontend user fetch", {
                externalUserId,
            });
            return null;
        }

        try {
            const result = await sendToFrontendAPIGet(`/users/${requestedExternalUserId}`);
            const payload = result?.data;
            const parsed = this.extractUserPayload(payload);

            if (!parsed) {
                const payloadKeys = this.isRecord(payload) ? Object.keys(payload) : [];
                await this.logThrottled(
                    "warn",
                    "frontend_user.unexpected_payload_shape",
                    "Frontend API returned user payload with unexpected shape",
                    {
                        externalUserId: requestedExternalUserId,
                        payloadType: typeof payload,
                        payloadKeys,
                    }
                );
                return null;
            }

            const resolvedExternalUserId = this.normalizeExternalUserId(
                parsed.externalUserId ?? parsed.external_user_id ?? parsed.id
            );
            if (!resolvedExternalUserId) {
                await this.logThrottled(
                    "warn",
                    "frontend_user.missing_external_user_id",
                    "Frontend API payload does not include a usable user id",
                    { externalUserId: requestedExternalUserId }
                );
                return null;
            }

            if (!this.externalUserIdsMatch(requestedExternalUserId, resolvedExternalUserId)) {
                await this.logThrottled(
                    "critical",
                    "frontend_user.external_user_id_mismatch",
                    "Frontend API returned mismatching user id for external user lookup",
                    {
                        requestedExternalUserId,
                        receivedExternalUserId: resolvedExternalUserId,
                    }
                );
                return null;
            }

            const parsedFrontendUserId = Number.parseInt(resolvedExternalUserId, 10);
            if (!Number.isFinite(parsedFrontendUserId) || parsedFrontendUserId <= 0) {
                await this.logThrottled(
                    "warn",
                    "frontend_user.invalid_numeric_id",
                    "Frontend API returned a non-numeric user id",
                    { externalUserId: requestedExternalUserId, receivedExternalUserId: resolvedExternalUserId }
                );
                return null;
            }

            return {
                id: parsedFrontendUserId,
                email: this.normalizeOptionalText(parsed.email),
                firstName: this.normalizeOptionalText(parsed.firstName ?? parsed.first_name),
                lastName: this.normalizeOptionalText(parsed.lastName ?? parsed.last_name),
            };
        } catch (error) {
            await this.logThrottled("warn", "frontend_user.fetch_failed", "Unable to fetch user details from frontend API", {
                externalUserId: requestedExternalUserId,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
    // Backward-compatible alias for existing callers with older typo.
    async getExternalUserByExernalUserId(externalUserId: string): Promise<FrontendUser | null> {
        return this.getExternalUserByExternalUserId(externalUserId);
    }

    // Best-effort user sync: uses frontend data when available and still creates a local user on fallback.
    async createExternalUser(externalUserId: string): Promise<User | null> {
        try {
            const result = await this.getExternalUserByExternalUserId(externalUserId);
            const resolvedExternalUserId =
                result?.id !== undefined && result?.id !== null
                    ? result.id.toString()
                    : externalUserId;

            const user = await userService.createUser(
                resolvedExternalUserId,
                result?.email ?? undefined,
                result?.firstName ?? undefined,
                result?.lastName ?? undefined
            );
            return user || null;
        } catch (error) {
            await this.logThrottled("error", "frontend_user.create_external_user_failed", "Failed to create external user", {
                externalUserId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}

export { UserUseCase };
export const userUseCase = new UserUseCase();

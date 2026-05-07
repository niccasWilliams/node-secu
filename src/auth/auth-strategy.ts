import { Request } from "express";
import { User, UserId } from "@/db/schema";
import { AUTH_MODE } from "./auth.config";
import { williamsAuthStrategy } from "./strategies/williams.strategy";
import { directAuthStrategy } from "./strategies/direct.strategy";

export interface AuthenticatedSession {
    userId: UserId;
    user: User;
    userAgent?: string;
    ipAddress?: string;
}

export interface AuthStrategy {
    /**
     * Verify whatever auth artifacts the strategy expects on the request
     * (Bearer access JWT for direct, frontend JWT + user-id header for williams)
     * and return the resolved local user, or null if unauthenticated.
     */
    authenticate(req: Request): Promise<AuthenticatedSession | null>;

    /**
     * Best-effort sync user id resolution — used by legacy helpers that only
     * need a userId without enforcing auth themselves.
     */
    resolveUserId(req: Request): Promise<UserId | undefined>;

    mode: "williams" | "direct";
}

export const authStrategy: AuthStrategy = AUTH_MODE === "direct"
    ? directAuthStrategy
    : williamsAuthStrategy;

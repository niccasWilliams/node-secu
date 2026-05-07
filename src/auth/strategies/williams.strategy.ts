import { Request } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { database } from "@/db";
import { users, User, UserId } from "@/db/schema";
import { resolveLocalUserByExternalUserId, getExternalUserIdFromRequest } from "@/util/utils";
import { AuthStrategy, AuthenticatedSession } from "../auth-strategy";

interface WilliamsTokenPayload {
    userId?: number | string;
    userAgent?: string;
    ipAddress?: string;
    type?: string;
}

function verifyFrontendJwt(req: Request): WilliamsTokenPayload | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    const secret = process.env.FRONTEND_API_KEY;
    if (!secret) {
        console.error("❌ FRONTEND_API_KEY is not set");
        return null;
    }

    try {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, secret);
        if (!decoded || typeof decoded !== "object") return null;
        return decoded as WilliamsTokenPayload;
    } catch (error) {
        console.error("❌ Williams JWT verification failed:", error instanceof Error ? error.message : error);
        return null;
    }
}

async function loadUser(id: UserId): Promise<User | undefined> {
    const [row] = await database.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
}

export const williamsAuthStrategy: AuthStrategy = {
    mode: "williams",

    async authenticate(req: Request): Promise<AuthenticatedSession | null> {
        const payload = verifyFrontendJwt(req);
        if (!payload) return null;

        const externalUserIdRaw = payload.userId;
        if (externalUserIdRaw === undefined || externalUserIdRaw === null) return null;

        const externalUserId = typeof externalUserIdRaw === "number"
            ? externalUserIdRaw
            : Number.parseInt(String(externalUserIdRaw), 10);
        if (!Number.isFinite(externalUserId) || externalUserId <= 0) return null;

        const user = await resolveLocalUserByExternalUserId(externalUserId);
        if (!user?.id) return null;

        const userAgent = payload.userAgent
            ?? (req.headers["x-user-agent"] as string | undefined)
            ?? req.get("user-agent")
            ?? undefined;
        const ipAddress = payload.ipAddress
            ?? (req.headers["x-ip-address"] as string | undefined)
            ?? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
            ?? req.ip
            ?? undefined;

        return { userId: user.id, user, userAgent, ipAddress };
    },

    async resolveUserId(req: Request): Promise<UserId | undefined> {
        const externalUserId = getExternalUserIdFromRequest(req);
        if (!externalUserId) return undefined;
        const user = await resolveLocalUserByExternalUserId(externalUserId);
        return user?.id;
    },
};

export { loadUser as _loadUserById };

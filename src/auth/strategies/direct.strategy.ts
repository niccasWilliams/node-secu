import { Request } from "express";
import { eq } from "drizzle-orm";
import { database } from "@/db";
import { User, UserId, users } from "@/db/schema";
import { jwtAuthService } from "../jwt.service";
import { AuthStrategy, AuthenticatedSession } from "../auth-strategy";

function extractBearer(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    return authHeader.slice(7);
}

async function loadUser(id: UserId): Promise<User | undefined> {
    const [row] = await database.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
}

function inferRequestMeta(req: Request) {
    const userAgent = (req.headers["x-user-agent"] as string | undefined)
        ?? req.get("user-agent")
        ?? undefined;
    const ipAddress = (req.headers["x-ip-address"] as string | undefined)
        ?? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.ip
        ?? undefined;
    return { userAgent, ipAddress };
}

export const directAuthStrategy: AuthStrategy = {
    mode: "direct",

    async authenticate(req: Request): Promise<AuthenticatedSession | null> {
        const token = extractBearer(req);
        if (!token) return null;

        const payload = jwtAuthService.verifyAccessToken(token);
        if (!payload) return null;

        const user = await loadUser(payload.sub);
        if (!user) return null;

        const meta = inferRequestMeta(req);
        return { userId: user.id, user, ...meta };
    },

    async resolveUserId(req: Request): Promise<UserId | undefined> {
        const token = extractBearer(req);
        if (!token) return undefined;
        const payload = jwtAuthService.verifyAccessToken(token);
        return payload?.sub;
    },
};

export { loadUser as _loadDirectUserById, inferRequestMeta as _inferRequestMeta };

import { eq } from "drizzle-orm";
import { database } from "@/db";
import { authPushTokens, User, UserId, users } from "@/db/schema";
import { nowInBerlin, normalizeEmail } from "@/util/utils";
import { jwtAuthService } from "@/auth/jwt.service";
import { passwordService } from "@/auth/password.service";
import { refreshTokenService } from "@/auth/refresh-token.service";
import { emailVerificationService } from "@/auth/email-verification.service";

export interface IssuedTokens {
    accessToken: string;
    refreshToken: string;
}

export interface RequestMeta {
    userAgent?: string;
    ipAddress?: string;
}

export const directAuthService = {
    async findByEmail(email: string): Promise<User | undefined> {
        const normalized = normalizeEmail(email);
        const [row] = await database.select().from(users).where(eq(users.email, normalized)).limit(1);
        return row;
    },

    async register(email: string, password: string, name: string | undefined, meta: RequestMeta): Promise<{ user: User } & IssuedTokens> {
        const normalizedEmail = normalizeEmail(email);
        const existing = await this.findByEmail(normalizedEmail);
        if (existing) {
            const err: any = new Error("Email already registered");
            err.statusCode = 409;
            throw err;
        }

        const passwordHash = await passwordService.hash(password);

        const [user] = await database.insert(users).values({
            email: normalizedEmail,
            passwordHash,
            name,
            createdAt: nowInBerlin(),
        }).returning();

        // Best-effort: send verification mail. Failure must not block registration —
        // the user can request a resend via /auth/verify-email/request.
        emailVerificationService.issueAndSend(user).catch((err) => {
            console.error("⚠️ verification mail failed for new user:", err);
        });

        const accessToken = jwtAuthService.signAccessToken(user.id);
        const { refreshToken } = await refreshTokenService.issue(user.id, meta);

        return { user, accessToken, refreshToken };
    },

    async login(email: string, password: string, meta: RequestMeta): Promise<{ user: User } & IssuedTokens> {
        const user = await this.findByEmail(email);
        if (!user || !user.passwordHash) {
            const err: any = new Error("Invalid credentials");
            err.statusCode = 401;
            throw err;
        }

        const ok = await passwordService.verify(user.passwordHash, password);
        if (!ok) {
            const err: any = new Error("Invalid credentials");
            err.statusCode = 401;
            throw err;
        }

        if (!user.emailVerifiedAt) {
            const err: any = new Error("email_not_verified");
            err.statusCode = 403;
            throw err;
        }

        const accessToken = jwtAuthService.signAccessToken(user.id);
        const { refreshToken } = await refreshTokenService.issue(user.id, meta);

        return { user, accessToken, refreshToken };
    },

    async refresh(rawRefresh: string, meta: RequestMeta): Promise<IssuedTokens | null> {
        const result = await refreshTokenService.rotate(rawRefresh, meta);
        if (!result) return null;
        const accessToken = jwtAuthService.signAccessToken(result.userId);
        return { accessToken, refreshToken: result.refreshToken };
    },

    async logout(rawRefresh: string | undefined): Promise<void> {
        if (!rawRefresh) return;
        await refreshTokenService.revoke(rawRefresh);
    },

    async upsertPushToken(userId: UserId, token: string, platform: string): Promise<void> {
        const now = nowInBerlin();
        await database.insert(authPushTokens)
            .values({ userId, token, platform, createdAt: now, updatedAt: now })
            .onConflictDoUpdate({
                target: authPushTokens.token,
                set: { userId, platform, updatedAt: now },
            });
    },

    publicUserShape(user: User) {
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            emailVerified: !!user.emailVerifiedAt,
            emailVerifiedAt: user.emailVerifiedAt,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    },
};

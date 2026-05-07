import crypto from "crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { database } from "@/db";
import { authRefreshTokens } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { REFRESH_TOKEN_TTL_SECONDS } from "./auth.config";
import { jwtAuthService, RefreshTokenPayload } from "./jwt.service";

function hashJti(jti: string): string {
    return crypto.createHash("sha256").update(jti).digest("hex");
}

export interface IssuedRefreshToken {
    refreshToken: string;
    jti: string;
}

export const refreshTokenService = {
    async issue(userId: number, meta?: { userAgent?: string; ipAddress?: string }): Promise<IssuedRefreshToken> {
        const jti = crypto.randomUUID();
        const refreshToken = jwtAuthService.signRefreshToken(userId, jti);
        const tokenHash = hashJti(jti);

        await database.insert(authRefreshTokens).values({
            userId,
            tokenHash,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
            userAgent: meta?.userAgent,
            ipAddress: meta?.ipAddress,
            createdAt: nowInBerlin(),
        });

        return { refreshToken, jti };
    },

    /**
     * Verify a refresh token JWT, look up its allowlist entry, and rotate it.
     *
     * Reuse-detection: if the JWT is valid but the allowlist row is already
     * revoked, treat as compromise — revoke ALL active refresh tokens for
     * that user (forces re-login on every device).
     */
    async rotate(rawToken: string, meta?: { userAgent?: string; ipAddress?: string }): Promise<{ userId: number; refreshToken: string; jti: string } | null> {
        const payload: RefreshTokenPayload | null = jwtAuthService.verifyRefreshToken(rawToken);
        if (!payload) return null;

        const tokenHash = hashJti(payload.jti);

        return database.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(authRefreshTokens)
                .where(eq(authRefreshTokens.tokenHash, tokenHash))
                .limit(1);

            if (!existing || existing.userId !== payload.sub) return null;

            if (existing.revokedAt) {
                console.warn(`⚠️ Refresh token reuse detected for user ${payload.sub} — revoking all sessions`);
                await tx
                    .update(authRefreshTokens)
                    .set({ revokedAt: nowInBerlin() })
                    .where(and(eq(authRefreshTokens.userId, payload.sub), isNull(authRefreshTokens.revokedAt)));
                return null;
            }

            if (existing.expiresAt.getTime() < Date.now()) return null;

            const newJti = crypto.randomUUID();
            const newTokenHash = hashJti(newJti);
            const newRefreshToken = jwtAuthService.signRefreshToken(payload.sub, newJti);

            await tx
                .update(authRefreshTokens)
                .set({ revokedAt: nowInBerlin(), replacedByTokenHash: newTokenHash })
                .where(eq(authRefreshTokens.id, existing.id));

            await tx.insert(authRefreshTokens).values({
                userId: payload.sub,
                tokenHash: newTokenHash,
                expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
                userAgent: meta?.userAgent,
                ipAddress: meta?.ipAddress,
                createdAt: nowInBerlin(),
            });

            return { userId: payload.sub, refreshToken: newRefreshToken, jti: newJti };
        });
    },

    async revoke(rawToken: string): Promise<void> {
        const payload = jwtAuthService.verifyRefreshToken(rawToken);
        if (!payload) return;
        const tokenHash = hashJti(payload.jti);
        await database
            .update(authRefreshTokens)
            .set({ revokedAt: nowInBerlin() })
            .where(and(eq(authRefreshTokens.tokenHash, tokenHash), isNull(authRefreshTokens.revokedAt)));
    },

    async cleanupExpired(): Promise<void> {
        await database.delete(authRefreshTokens).where(lt(authRefreshTokens.expiresAt, new Date()));
    },
};

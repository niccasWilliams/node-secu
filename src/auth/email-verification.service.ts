import crypto from "crypto";
import React from "react";
import { and, eq, isNull, lt } from "drizzle-orm";
import { database } from "@/db";
import { authEmailVerificationTokens, User, UserId, users } from "@/db/schema";
import { nowInBerlin } from "@/util/utils";
import { emailService } from "@/util/email.service";
import { EmailVerify } from "@/util/email-templates/EmailVerify";
import { EMAIL_VERIFY_TTL_HOURS, EMAIL_VERIFY_TTL_SECONDS, getPublicBaseUrl } from "./auth.config";

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function buildVerifyUrl(rawToken: string): string {
    const url = new URL(`${getPublicBaseUrl()}/auth/verify-email`);
    url.searchParams.set("token", rawToken);
    return url.toString();
}

export const emailVerificationService = {
    /**
     * Issues a new verification token, stores its sha256 hash, and emails
     * the recipient a link. Existing pending tokens for the same email are
     * invalidated so that only the freshest link is usable.
     */
    async issueAndSend(user: User): Promise<void> {
        if (!user.email) throw new Error("Cannot issue verification: user has no email");
        if (user.emailVerifiedAt) return;

        const rawToken = crypto.randomBytes(32).toString("base64url");
        const tokenHash = hashToken(rawToken);

        await database.transaction(async (tx) => {
            await tx
                .update(authEmailVerificationTokens)
                .set({ consumedAt: nowInBerlin() })
                .where(and(
                    eq(authEmailVerificationTokens.userId, user.id),
                    isNull(authEmailVerificationTokens.consumedAt),
                ));

            await tx.insert(authEmailVerificationTokens).values({
                userId: user.id,
                tokenHash,
                email: user.email!,
                expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_SECONDS * 1000),
                createdAt: nowInBerlin(),
            });
        });

        const html = emailService.renderReactComponent(
            React.createElement(EmailVerify, {
                verifyUrl: buildVerifyUrl(rawToken),
                recipientName: user.name ?? user.firstName ?? null,
                expiresInHours: EMAIL_VERIFY_TTL_HOURS,
            }),
        );

        try {
            await emailService.sendEmail(user.email, "Bitte bestätige deine E-Mail-Adresse", html);
        } catch (error) {
            console.error("❌ Failed to send verification email:", error);
            // Token row stays in DB; user can request a resend.
            throw error;
        }
    },

    /**
     * Verify a token presented by the user. On success: marks the user as
     * verified and consumes the token. Returns the verified user.
     */
    async confirm(rawToken: string): Promise<User | null> {
        const tokenHash = hashToken(rawToken);

        return database.transaction(async (tx) => {
            const [row] = await tx
                .select()
                .from(authEmailVerificationTokens)
                .where(eq(authEmailVerificationTokens.tokenHash, tokenHash))
                .limit(1);

            if (!row) return null;
            if (row.consumedAt) return null;
            if (row.expiresAt.getTime() < Date.now()) return null;

            await tx
                .update(authEmailVerificationTokens)
                .set({ consumedAt: nowInBerlin() })
                .where(eq(authEmailVerificationTokens.id, row.id));

            const [user] = await tx
                .update(users)
                .set({ emailVerifiedAt: nowInBerlin(), updatedAt: nowInBerlin() })
                .where(eq(users.id, row.userId))
                .returning();

            return user ?? null;
        });
    },

    async resend(userId: UserId): Promise<void> {
        const [user] = await database.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) return;
        if (user.emailVerifiedAt) return;
        await this.issueAndSend(user);
    },

    async cleanupExpired(): Promise<void> {
        await database
            .delete(authEmailVerificationTokens)
            .where(lt(authEmailVerificationTokens.expiresAt, new Date()));
    },
};

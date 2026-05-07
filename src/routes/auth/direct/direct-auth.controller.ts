import { Request, Response } from "express";
import { authStrategy } from "@/auth/auth-strategy";
import { emailVerificationService } from "@/auth/email-verification.service";
import { responseHandler } from "@/lib/communication";
import { directAuthService } from "./direct-auth.service";
import { renderVerifyEmailPage, VerifyEmailVariant } from "./verify-email.page";

function inferMeta(req: Request) {
    const userAgent = (req.headers["x-user-agent"] as string | undefined)
        ?? req.get("user-agent")
        ?? undefined;
    const ipAddress = (req.headers["x-ip-address"] as string | undefined)
        ?? (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.ip
        ?? undefined;
    return { userAgent, ipAddress };
}

export const directAuthController = {
    async register(req: Request, res: Response) {
        try {
            const { email, password, name } = req.body;
            const result = await directAuthService.register(email, password, name, inferMeta(req));
            return responseHandler(res, 200, undefined, {
                user: directAuthService.publicUserShape(result.user),
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            });
        } catch (error: any) {
            return responseHandler(res, error?.statusCode ?? 500, error?.message ?? "register_failed");
        }
    },

    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;
            const result = await directAuthService.login(email, password, inferMeta(req));
            return responseHandler(res, 200, undefined, {
                user: directAuthService.publicUserShape(result.user),
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
            });
        } catch (error: any) {
            return responseHandler(res, error?.statusCode ?? 500, error?.message ?? "login_failed");
        }
    },

    async refresh(req: Request, res: Response) {
        try {
            const { refreshToken } = req.body;
            const tokens = await directAuthService.refresh(refreshToken, inferMeta(req));
            if (!tokens) return responseHandler(res, 401, "invalid_refresh_token");
            return responseHandler(res, 200, undefined, tokens);
        } catch (error: any) {
            return responseHandler(res, 500, error?.message ?? "refresh_failed");
        }
    },

    async logout(req: Request, res: Response) {
        try {
            const { refreshToken } = req.body ?? {};
            await directAuthService.logout(refreshToken);
            return responseHandler(res, 204);
        } catch (error: any) {
            console.error("logout error:", error);
            return responseHandler(res, 204);
        }
    },

    async me(req: Request, res: Response) {
        const session = await authStrategy.authenticate(req);
        if (!session) return responseHandler(res, 401, "unauthorized");
        return responseHandler(res, 200, undefined, directAuthService.publicUserShape(session.user));
    },

    async requestEmailVerification(req: Request, res: Response) {
        try {
            const session = await authStrategy.authenticate(req);
            if (!session) return responseHandler(res, 401, "unauthorized");
            if (session.user.emailVerifiedAt) {
                return responseHandler(res, 200, undefined, { ok: true, alreadyVerified: true });
            }
            await emailVerificationService.resend(session.user.id);
            return responseHandler(res, 200, undefined, { ok: true });
        } catch (error: any) {
            console.error("verify-email request error:", error);
            return responseHandler(res, 500, error?.message ?? "verify_request_failed");
        }
    },

    async confirmEmailVerification(req: Request, res: Response) {
        try {
            const { token } = req.body;
            const user = await emailVerificationService.confirm(token);
            if (!user) return responseHandler(res, 400, "invalid_or_expired_token");
            return responseHandler(res, 200, undefined, {
                ok: true,
                user: directAuthService.publicUserShape(user),
            });
        } catch (error: any) {
            console.error("verify-email confirm error:", error);
            return responseHandler(res, 500, error?.message ?? "verify_confirm_failed");
        }
    },

    /**
     * Browser-facing verification landing page. The mail link points here;
     * the backend consumes the token and renders a small status page so
     * the user gets visual feedback without bouncing through a frontend.
     */
    async verifyEmailLandingPage(req: Request, res: Response) {
        const token = typeof req.query.token === "string" ? req.query.token : "";
        let variant: VerifyEmailVariant;

        if (!token) {
            variant = "missing";
        } else {
            try {
                const user = await emailVerificationService.confirm(token);
                variant = user ? "success" : "invalid";
            } catch (error) {
                console.error("verify-email landing error:", error);
                variant = "invalid";
            }
        }

        const status = variant === "success" ? 200 : variant === "missing" ? 400 : 410;
        res.status(status).type("html").send(renderVerifyEmailPage(variant));
    },

    async pushToken(req: Request, res: Response) {
        try {
            const session = await authStrategy.authenticate(req);
            if (!session) return responseHandler(res, 401, "unauthorized");
            const { token, platform } = req.body;
            await directAuthService.upsertPushToken(session.user.id, token, platform);
            return responseHandler(res, 204);
        } catch (error: any) {
            console.error("push-token error:", error);
            return responseHandler(res, 500, error?.message ?? "push_token_failed");
        }
    },
};

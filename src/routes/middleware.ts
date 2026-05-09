/**
 * MIDDLEWARE SECURITY ARCHITECTURE
 *
 * This application uses a two-environment security strategy on Railway:
 *
 * 1. INTERNAL NETWORK (HTTP + API Key):
 *    - Frontend requests via Railway's internal network
 *    - User authentication endpoints (isAuthUser, hasPermission)
 *    - Requires: HTTP protocol + x-api-key header
 *
 * 2. EXTERNAL NETWORK (HTTPS + API Key):
 *    - External automated requests (webhooks, integrations)
 *    - Cron job endpoints (isJob with CRON_JOB_SECRET)
 *    - Requires: HTTPS protocol + x-api-key header (or specific auth)
 *
 * LOCAL DEVELOPMENT:
 *    - All protocol checks are skipped when HOST_NAME === "localhost"
 *    - API key validation is skipped for easier development
 *
 * Environment Variables Required:
 *    - API_KEY: Main API key for route protection
 *    - FRONTEND_API_KEY: JWT signing key for frontend tokens
 *    - CRON_JOB_SECRET: Bearer token for cron job authentication
 *    - HOST_NAME: Set to "localhost" for local dev, otherwise production
 */

import { Request, Response, NextFunction } from "express";
import { responseHandler } from "@/lib/communication";
import { AppPermissionValue } from "./auth/roles/permissions/permission.service";
import { permissionUseCase } from "./auth/roles/permissions/permission.useCase";
import { userActivityService } from "./auth/users/activitys/user-activity.service";
import { authStrategy } from "@/auth/auth-strategy";

/**
 * Frontend channel = the way an authenticated frontend client reaches this
 * backend. Williams expects internal HTTP-only traffic (Railway private net).
 * Direct expects public HTTPS (Expo apps, serverless frontends).
 */
function enforceFrontendChannel(req: Request, res: Response): boolean {
    if (process.env.HOST_NAME === "localhost") return true;
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";

    if (authStrategy.mode === "williams") {
        // Williams expects an HTTP internal channel (Railway private net or Cloudflare tunnel).
        // Cloudflare sets x-forwarded-proto: https even though the tunnel socket is plain HTTP,
        // so only req.secure (actual TLS on the socket) is a reliable signal here.
        if (req.secure) {
            responseHandler(res, 403, "Forbidden: User routes only accessible via HTTP (internal network)");
            return false;
        }
        return true;
    }

    // direct-mode: serverless frontends speak HTTPS from the public internet.
    if (!isHttps) {
        responseHandler(res, 403, "Forbidden: HTTPS required");
        return false;
    }
    return true;
}


const SKIP_TRACKING: Array<{ method?: string; pattern: RegExp }> = [
    // exakte DELETE-Route: /users/delete/external/:id
    { method: "DELETE", pattern: /^\/users\/delete\/external\/\d+$/ },
    // ggf. weitere Routen:
    // { pattern: /^\/healthz$/ },
];

function shouldSkipTracking(req: Request) {
    const path = req.originalUrl.split("?")[0]; // Querystring ignorieren
    const method = req.method.toUpperCase();
    return SKIP_TRACKING.some(({ method: m, pattern }) => {
        if (m && m.toUpperCase() !== method) return false;
        return pattern.test(path);
    });
}



export class AccessControl {

    /**
     * Utility function to skip middleware in local development
     * Used by isAuthUser to bypass authentication checks locally
     * @param middleware - The middleware function to wrap
     * @returns Either a passthrough function (local) or the original middleware (production)
     */
    static skipIfLocal(middleware: (req: Request, res: Response, next: NextFunction) => any) {
        const isLocal = process.env.HOST_NAME === "localhost";
        if (isLocal) return (req: Request, res: Response, next: NextFunction) => next();
        return middleware;
    }




    /**
     * Enforces HTTP-only access (internal network) with API key validation
     * Used for frontend requests within Railway's internal network
     * Skipped in local environment
     */
    static onlyAllowHttp(req: Request, res: Response, next: NextFunction) {
        // Skip all checks in local environment
        if (process.env.HOST_NAME === "localhost") {
            return next();
        }

        // Check if request came via HTTPS (including proxied requests)
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

        // Enforce HTTP in production (internal network only - should NOT come via public HTTPS)
        if (isHttps) {
            console.error("❌ HTTP required (internal network), received via HTTPS");
            return res.status(403).send("Forbidden: This route is only accessible via HTTP (internal network)");
        }

        // Validate API key
        const apiKey = req.headers["x-api-key"];
        const expectedApiKey = process.env.API_KEY;

        if (!expectedApiKey) {
            console.error("❌ API_KEY is not configured");
            return res.status(500).send("Server misconfigured");
        }

        if (!apiKey || apiKey !== expectedApiKey) {
            console.error("API KEY MUISSMATCH, should be:", expectedApiKey, "but got:", apiKey);
            console.error("❌ Invalid or missing API key");
            return res.status(403).send("Forbidden: Invalid API key");
        }

        next();
    }

    /**
     * Enforces HTTPS-only access with API key validation
     * Used for external automated requests (webhooks, integrations, etc.)
     * Skipped in local environment
     */
    static onlyAllowHttps(req: Request, res: Response, next: NextFunction) {
        // Skip all checks in local environment
        if (process.env.HOST_NAME === "localhost") {
            return next();
        }

        // Check if request came via HTTPS (including proxied requests)
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

        // Enforce HTTPS in production
        if (!isHttps) {
            console.error("❌ HTTPS required, received protocol:", req.secure ? 'https' : 'http',
                         "x-forwarded-proto:", req.headers['x-forwarded-proto']);
            return res.status(403).send("Forbidden: HTTPS required");
        }

        // Validate API key
        const apiKey = req.headers["x-api-key"];
        const expectedApiKey = process.env.API_KEY;

        if (!expectedApiKey) {
            console.error("❌ API_KEY is not configured");
            return res.status(500).send("Server misconfigured");
        }

        if (!apiKey || apiKey !== expectedApiKey) {
            console.error("❌ Invalid or missing API key");
            return res.status(403).send("Forbidden: Invalid API key");
        }

        next();
    }




    /**
     * Validates the active auth-strategy's frontend token (Williams: FRONTEND_API_KEY JWT;
     * Direct: access JWT) and attaches the resolved local user to the request.
     */
    static async isFrontendRequest(req: Request, res: Response, next: NextFunction) {
        try {
            const session = await authStrategy.authenticate(req);
            if (!session) {
                return res.status(403).send("Forbidden: Invalid or expired token");
            }
            (req as any).tokenPayload = {
                userId: session.user.externalUserId
                    ? Number.parseInt(session.user.externalUserId, 10)
                    : session.user.id,
                clientUserAgent: session.userAgent,
                clientIpAddress: session.ipAddress,
            };
            (req as any).user = session.user;
            next();
        } catch (error) {
            console.error("❌ isFrontendRequest error:", error);
            return res.status(403).send("Forbidden: Invalid or expired token");
        }
    }

    /**
     * Authenticates user via token
     * Only accessible via HTTP (internal network from frontend)
     * Skipped in local environment
     */
    static isAuthUser() {
        return this.skipIfLocal(async (req: Request, res: Response, next: NextFunction) => {
            try {
                if (!enforceFrontendChannel(req, res)) return;

                const session = await authStrategy.authenticate(req);
                if (!session) return responseHandler(res, 401, "Unauthorized: Invalid token");

                const user = session.user;
                const userAgent = session.userAgent;
                const ipAddress = session.ipAddress;

                console.log("✅ User Auth Success:", user.id, user.email);





                // Track user daily activity AFTER response (to capture status code and error)
                if (user.id) {
                    const uid = user.id; // vermeidet Shadowing von userId
                    const endpoint = req.originalUrl || req.url;
                    const method = req.method;

                    // Intercept res.json, um evtl. Fehlermeldung zu greifen
                    const originalJson = res.json.bind(res);
                    let errorMessage: string | undefined;

                    res.json = function (body: any) {
                        if (res.statusCode >= 400 && body?.message) {
                            errorMessage = body.message;
                        }
                        return originalJson(body);
                    };

                    res.on("finish", () => {
                        const statusCode = res.statusCode;

                        // ⛔ Früh aussteigen, wenn Route vom Tracking ausgeschlossen ist
                        if (shouldSkipTracking(req)) {
                            console.log("🚫 Skipping activity tracking for:", req.method, req.originalUrl);
                            return; // <-- WICHTIG!
                        }

                        userActivityService
                            .trackDailyActivity(
                                uid,
                                endpoint,
                                method,
                                statusCode,
                                errorMessage,
                                userAgent,
                                ipAddress
                            )
                            .catch((err) => {
                                console.error("❌ Failed to track user activity:", err);
                            });
                    });
                }

                // Optional: attach user to request
                (req as any).user = user;

                next();
            } catch (error: any) {
                console.error("❌ User Auth Error:", error);
                return responseHandler(res, 500, "Internal Server Error");
            }
        });
    }

    /**
     * Authenticates cron job requests
     * Only accessible via HTTPS (external cron service)
     * Skipped in local environment
     */
    static isJob(req: Request, res: Response, next: NextFunction) {
        try {
            console.log("🔍 isJob middleware called");
            // Check if request came via HTTPS (including proxied requests)
            const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

            // Enforce HTTPS in production
            if (process.env.HOST_NAME !== "localhost" && !isHttps) {
                console.error("❌ Forbidden: Job endpoints only accessible via HTTPS");
                return res.status(403).send("Forbidden: Job endpoints only accessible via HTTPS");
            }

            const authHeader = req.headers.authorization;

            // Format: "Bearer <token>"
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                console.error("❌ Unauthorized: Invalid auth format");
                return res.status(401).send("Unauthorized: Invalid auth format");
            }

            const token = authHeader.split(" ")[1];
            const expectedToken = process.env.CRON_JOB_SECRET;

            if (!expectedToken) {

                console.error("❌ CRON_JOB_SECRET is not set");
                return res.status(500).send("Server misconfigured");
            }

            if (token !== expectedToken) {
                console.error("❌ Unauthorized: Invalid token");
                return res.status(401).send("Unauthorized: Invalid token");
            }

            return next();
        } catch (error) {
            console.error("❌ Error in isJob middleware:", error);
            return res.status(500).send("Internal Server Error");
        }
    }




    /**
     * Checks if authenticated user has required permission
     * Only accessible via HTTP (internal network from frontend)
     * Not skipped in local environment (permissions always checked)
     */
    static hasPermission(requiredPermission: AppPermissionValue) {
        return async (req: Request, res: Response, next: NextFunction) => {
            try {
                if (!enforceFrontendChannel(req, res)) return;

                const session = await authStrategy.authenticate(req);
                if (!session) {
                    return responseHandler(res, 401, "Unauthorized: Invalid token");
                }

                const userPermissions = await permissionUseCase.getUserPermissions(session.user.id);
                const hasPermission = userPermissions.some(p => p.name === requiredPermission);

                if (!hasPermission) {
                    console.error(`❌ Forbidden: Missing permission "${requiredPermission}" for user ${session.user.id}`);
                    return responseHandler(res, 403, `Forbidden: Missing permission "${requiredPermission}"`);
                }

                (req as any).user = session.user;
                next();
            } catch (error) {
                console.error("Permission Check Error:", error);
                return responseHandler(res, 500, "Internal Server Error");
            }
        };
    }

}

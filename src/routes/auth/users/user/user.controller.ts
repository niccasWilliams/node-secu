import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { getExternalUserIdFromRequest, getLanguageFromRequest, getUserIdFromRequest } from "@/util/utils";
import { userService } from "@/routes/auth/users/user/user.service";
import jwt from "jsonwebtoken";
import { permissionUseCase } from "@/routes/auth/roles/permissions/permission.useCase";
import { AppPermissions } from "@/routes/auth/roles/permissions/permission.service";
import { PaginatedResult } from "@/types/types";
import { User } from "@/db/schema";


// Standardisierte Response-Funktion
type VerifyResult = {
    valid: boolean;
    userId?: number;
    userAgent?: string;
    ipAddress?: string;
    tokenType?: "frontend" | "backend-to-backend";
};


class UserController {

    async getAllUsers(req: Request, res: Response) {
        try {
            const result = await userService.getAllUsers();
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in getAllUsers:", error);
            return responseHandler(res, 500, error.message || error || "Internal Server Error");
        }
    }


    async createUser(req: Request, res: Response) {
        try {
            console.log("body:" + req.body)
            const language = await getLanguageFromRequest(req);
            if (!language) return responseHandler(res, 400, "Invalid Request");
            const { email, firstName, lastName, externalUserId } = req.body;
            const result = await userService.createUser(externalUserId, email, firstName, lastName, undefined);
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in createUser:", error);
            return responseHandler(res, 500, error.message || error || "Internal Server Error");
        }
    }

    async deleteUser(req: Request, res: Response) {
        try {
            const userId = parseInt(req.params.userId, 10);
            if (isNaN(userId)) return responseHandler(res, 400, "Invalid Request");
            const result = await userService.deleteUser(userId);
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in deleteUser:", error);
            return responseHandler(res, 500, error || "Internal Server Error");
        }
    }

    async deleteFrontendUser(req: Request, res: Response) {
        try {
            const frontendUserId = parseInt(req.params.frontendUserId, 10);
            //yes not perfect by we have the externalUserId herer as string, but it has to be a number right now
            if (isNaN(frontendUserId)) return responseHandler(res, 400, "Invalid Request");
            const stringUserId = frontendUserId.toString()
            const result = await userService.deleteUserByFrontendUserId(stringUserId);
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in deleteUser:", error);
            return responseHandler(res, 500, error || "Internal Server Error");
        }
    }





    async getUserById(req: Request, res: Response) {
        try {
            const userIdParam = req.params.userId;
            const requestedUserId = parseInt(userIdParam, 10);
            if (isNaN(requestedUserId)) return responseHandler(res, 400, "Invalid user ID");

            const currentUserId = await getUserIdFromRequest(req);
            if (!currentUserId) return responseHandler(res, 401, "Unauthorized");

            //PERMISSION CHECK
            if (requestedUserId !== currentUserId) {
                const hasPermission = await permissionUseCase.hasUserPermission(currentUserId, AppPermissions.UsersView);
                if (!hasPermission) return responseHandler(res, 403, "Forbidden");
            }

            const result = await userService.getUserById(requestedUserId);
            if (!result) return responseHandler(res, 404, "User not found");

            return responseHandler(res, 200, undefined, result);

        } catch (error: any) {
            console.error("Error in getUserById:", error);
            return responseHandler(res, 500, error.message || error || "Internal Server Error");
        }
    }


    async getUserByExternalUserId(req: Request, res: Response) {
        try {
            const externalUserIdParam = req.params.externalUserId;
            if (!externalUserIdParam) return responseHandler(res, 400, "Missing external user ID in URL");
            const externalUserId = parseInt(externalUserIdParam, 10);
            if (isNaN(externalUserId)) return responseHandler(res, 400, "Invalid external user ID");


            const userId = await getUserIdFromRequest(req);
            if (!userId) return responseHandler(res, 401, "Invalid Requsest");
            const externalUserIdFromHeader = getExternalUserIdFromRequest(req);
            if (!externalUserIdFromHeader) return responseHandler(res, 400, "Invalid Request");


            //PERMISSION CHECK
            if (externalUserId !== externalUserIdFromHeader) {
                const hasPermission = await permissionUseCase.hasUserPermission(userId, AppPermissions.UsersView);
                if (!hasPermission) return responseHandler(res, 403, "Forbidden");
            }

            const result = await userService.getUserByExternalUserId(externalUserId);
            if (!result) return responseHandler(res, 404, "User not found");

            return responseHandler(res, 200, undefined, result);

        } catch (error: any) {
            console.error("Error in getUserByExternalUserId:", error);
            return responseHandler(res, 500, error.message || error || "Internal Server Error");
        }
    }

    async getUserByEmail(req: Request, res: Response) {
        try {
            const email = req.params.email
            if (!email) return responseHandler(res, 400, "Invalid Request");
            const result = await userService.getUserByEmail(email);
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in getUserByEmail:", error);
            return responseHandler(res, 500, error.message || error || "Internal Server Error");
        }
    }






    async verifyToken(req: Request): Promise<VerifyResult> {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) return { valid: false };

        // ⚠️ Frontend-Secret muss mit dem im Frontend verwendeten Secret übereinstimmen!
        const API_KEY = process.env.FRONTEND_API_KEY;
        if (!API_KEY) throw new Error("FRONTEND_API_KEY is not set");

        try {
            const token = authHeader.split(" ")[1];
            const payload = jwt.verify(token, API_KEY) as any;

            if (!payload || typeof payload !== "object") {
                return { valid: false };
            }

            // Token-Typ erkennen (dein Frontend setzt entweder userId oder type: "backend-to-backend")
            const tokenType: VerifyResult["tokenType"] =
                typeof payload.userId !== "undefined" ? "frontend" :
                    payload.type === "backend-to-backend" ? "backend-to-backend" :
                        "frontend";

            // Werte aus dem Payload (vom Frontend gesetzt)
            const payloadUserId = payload.userId;
            const payloadUserAgent = payload.userAgent as string | undefined;
            const payloadIpAddress = payload.ipAddress as string | undefined;

            // Header-Fallbacks (falls Payload fehlt/leer)
            const headerUserAgent =
                (req.headers["x-user-agent"] as string | undefined) ??
                req.get("user-agent") ??
                undefined;

            const headerIp =
                (req.headers["x-ip-address"] as string | undefined) ??
                (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
                req.ip ??
                undefined;

            // Finalwerte bestimmen (Payload bevorzugen, dann Header)
            const userAgent = payloadUserAgent ?? headerUserAgent;
            const ipAddress = payloadIpAddress ?? headerIp;

            // userId validieren (nur wenn vorhanden)
            let userIdNum: number | undefined = undefined;
            if (typeof payloadUserId !== "undefined") {
                userIdNum = Number.parseInt(String(payloadUserId), 10);
                if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
                    throw new Error("Invalid userId in token payload");
                }
            }

            // Optional: auf req ablegen, damit nachfolgende Middlewares ohne erneutes Parsen drankommen
            (req as any).tokenPayload = {
                userId: userIdNum,
                clientUserAgent: userAgent,
                clientIpAddress: ipAddress,
                tokenType,
            };

            return {
                valid: true,
                userId: userIdNum,
                userAgent,
                ipAddress,
                tokenType,
            };
        } catch (error) {
            console.error("Token verification failed:", error);
            return { valid: false };
        }
    }


    async updateUser(req: Request, res: Response) {
        try {
            const frontendUserId = parseInt(req.params.frontendUserId, 10);
            //yes not perfect by we have the externalUserId herer as string, but it has to be a number right now
            if (isNaN(frontendUserId)) return responseHandler(res, 400, "Invalid Request");
            const stringUserId = frontendUserId.toString()
            const { firstName, lastName } = req.body;
            const result = await userService.updateUserByFrontendUserId(stringUserId, { firstName, lastName });
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in updateUser:", error);
            return responseHandler(res, 500, error.message || error || "Internal Server Error");
        }
    }


    async searchUsers(req: Request, res: Response) {
        try {
            const user = await getUserIdFromRequest(req);
            if (!user) return responseHandler(res, 401, "Unauthorized");
            //todo for later: further check.. (lets try to allow it for all users, but restrict it somehow :D)
            const search = req.query.search as string | undefined;
            const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
            const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;

            const result: PaginatedResult<User> = await userService.searchUsers(search, page, pageSize);
            console.log("Search result:", result);
            return responseHandler(res, 200, undefined, result);
        } catch (error: any) {
            console.error("Error in searchUsers:", error);
            return responseHandler(res, 500, error.message || error || "Internal Server Error");
        }
    }




}


export const userController = new UserController();
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from "./auth.config";

export interface AccessTokenPayload {
    sub: number;
    type: "access";
}

export interface RefreshTokenPayload {
    sub: number;
    type: "refresh";
    jti: string;
}

function getAccessSecret(): string {
    const s = process.env.AUTH_JWT_ACCESS_SECRET;
    if (!s) throw new Error("AUTH_JWT_ACCESS_SECRET is not set");
    return s;
}

function getRefreshSecret(): string {
    const s = process.env.AUTH_JWT_REFRESH_SECRET;
    if (!s) throw new Error("AUTH_JWT_REFRESH_SECRET is not set");
    return s;
}

export const jwtAuthService = {
    signAccessToken(userId: number): string {
        const payload: AccessTokenPayload = { sub: userId, type: "access" };
        const opts: SignOptions = { expiresIn: ACCESS_TOKEN_TTL_SECONDS, algorithm: "HS256" };
        return jwt.sign(payload, getAccessSecret(), opts);
    },

    signRefreshToken(userId: number, jti: string): string {
        const payload: RefreshTokenPayload = { sub: userId, type: "refresh", jti };
        const opts: SignOptions = { expiresIn: REFRESH_TOKEN_TTL_SECONDS, algorithm: "HS256" };
        return jwt.sign(payload, getRefreshSecret(), opts);
    },

    verifyAccessToken(token: string): AccessTokenPayload | null {
        try {
            const decoded = jwt.verify(token, getAccessSecret(), { algorithms: ["HS256"] }) as JwtPayload;
            if (decoded.type !== "access" || typeof decoded.sub !== "number") return null;
            return { sub: decoded.sub, type: "access" };
        } catch {
            return null;
        }
    },

    verifyRefreshToken(token: string): RefreshTokenPayload | null {
        try {
            const decoded = jwt.verify(token, getRefreshSecret(), { algorithms: ["HS256"] }) as JwtPayload;
            if (decoded.type !== "refresh" || typeof decoded.sub !== "number" || typeof decoded.jti !== "string") return null;
            return { sub: decoded.sub, type: "refresh", jti: decoded.jti };
        } catch {
            return null;
        }
    },
};

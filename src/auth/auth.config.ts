export type AuthMode = "williams" | "direct";

const raw = (process.env.AUTH_MODE || "williams").toLowerCase();
if (raw !== "williams" && raw !== "direct") {
    throw new Error(`Invalid AUTH_MODE "${raw}". Allowed values: "williams" | "direct".`);
}

export const AUTH_MODE: AuthMode = raw as AuthMode;

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export const EMAIL_VERIFY_TTL_HOURS = 24;
export const EMAIL_VERIFY_TTL_SECONDS = EMAIL_VERIFY_TTL_HOURS * 60 * 60;

/**
 * Public, browser-reachable URL of THIS backend. The verification mail
 * sends users to `${PUBLIC_URL}/auth/verify-email?token=…`, which the
 * backend itself serves as a small landing page.
 */
export function getPublicBaseUrl(): string {
    const url = process.env.PUBLIC_URL;
    if (!url) throw new Error("PUBLIC_URL is not set — required for email verification links");
    return url.replace(/\/$/, "");
}

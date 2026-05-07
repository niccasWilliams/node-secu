// Environment Variable Validation
// Validates required environment variables on startup

import { AUTH_MODE } from "@/auth/auth.config";

const requiredEnvVars = [
    "DATABASE_URL",
    "NODE_PORT",
    "HOST_NAME",
] as const;

const optionalEnvVars = [
    "CRON_JOB_SECRET",
    "PUBLIC_URL",
    "FRONTEND_HOST_NAME",
    "DATA_ENCRYPTION_KEY",
] as const;

const williamsModeRequiredEnvVars = [
    "FRONTEND_API_KEY",
] as const;

const directModeRequiredEnvVars = [
    "AUTH_JWT_ACCESS_SECRET",
    "AUTH_JWT_REFRESH_SECRET",
    "PUBLIC_URL",
] as const;

export function validateEnvironmentVariables(): void {
    const missing: string[] = [];
    const warnings: string[] = [];

    for (const varName of requiredEnvVars) {
        if (!process.env[varName]) missing.push(varName);
    }

    const modeRequired = AUTH_MODE === "direct" ? directModeRequiredEnvVars : williamsModeRequiredEnvVars;
    for (const varName of modeRequired) {
        if (!process.env[varName]) missing.push(varName);
    }

    for (const varName of optionalEnvVars) {
        if (!process.env[varName]) warnings.push(varName);
    }

    if (missing.length > 0) {
        console.error(`❌ Missing required environment variables (AUTH_MODE=${AUTH_MODE}):`);
        missing.forEach(v => console.error(`   - ${v}`));
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    if (warnings.length > 0 && process.env.NODE_ENV === "production") {
        console.warn("⚠️  Missing optional environment variables (may cause issues):");
        warnings.forEach(v => console.warn(`   - ${v}`));
    }

    console.log(`✅ Environment variables validated successfully (AUTH_MODE=${AUTH_MODE})`);
}

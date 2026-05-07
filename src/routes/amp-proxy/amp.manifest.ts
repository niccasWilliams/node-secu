import { APP_ID } from "@/app.config";

/**
 * AMP App Manifest — node-template
 *
 * Deklariert was diese App ist, was sie braucht, und was sie kann.
 * Wird von AMP via /_discover abgerufen und automatisch verarbeitet.
 *
 * Secret-Management Tiers:
 *   railway_reference  — Railway liefert den Wert via ${{Service.VAR}}
 *   auto_generate      — AMP generiert einmalig, setzt auf Railway
 *   amp_managed        — AMP synct aus Company-Vault / Provider
 *   customer_managed   — Interaktiver Onboarding-Flow (mit group) oder auto-filled (ohne group)
 */
export const AMP_MANIFEST = {
    appId: APP_ID,
    manifestVersion: "1.0" as const,
    appType: "express" as const,
    proxyVersion: "1.0",

    capabilities: {
        logs: true,
        features: false,
        limits: false,
        resources: false,
        botProtection: false,
        idm: true,
    },

    supportedKeys: {
        GET: ["logs"],
        POST: ["create-log"],
        DELETE: ["delete-logs"],
    },

    dependencies: [
        {
            appId: "node-amp",
            type: "data" as const,
            criticality: "important" as const,
            purpose: "AMP-Proxy fuer Log-Intelligence und App-Management",
        },
    ],

    requiredSecrets: [
        // ── railway_reference: Railway liefert den Wert via ${{Service.VAR}} ─
        { key: "DATABASE_URL", description: "PostgreSQL Connection String", required: true, targets: ["railway"], category: "infrastructure", managementMode: "railway_reference", railwayReference: "${{Postgres.DATABASE_URL}}" },

        // ── auto_generate: AMP generiert einmalig, setzt auf Railway ─────────
        { key: "API_KEY", description: "App-eigener API Key fuer Route-Protection", required: true, targets: ["railway"], category: "security", managementMode: "auto_generate", autoGenerateType: "uuid" },
        { key: "DATA_ENCRYPTION_KEY", description: "AES-256 Key fuer Feld-Verschluesselung (min. 32 Zeichen)", required: true, targets: ["railway"], category: "security", managementMode: "auto_generate", autoGenerateType: "hex64" },
        { key: "JWT_SECRET", description: "JWT Signing Key fuer OAuth2 Token-Erstellung", required: true, targets: ["railway"], category: "security", managementMode: "auto_generate", autoGenerateType: "hex64" },
        { key: "CRON_JOB_SECRET", description: "Bearer Token fuer Cron-Job Authentifizierung", required: true, targets: ["railway"], category: "security", managementMode: "auto_generate", autoGenerateType: "uuid" },
        { key: "API_KEY_PEPPER_V1", description: "HMAC Pepper fuer API Key Hashing (versioniert)", required: true, targets: ["railway"], category: "security", managementMode: "auto_generate", autoGenerateType: "hex64" },
        { key: "OAUTH2_PEPPER_V1", description: "HMAC Pepper fuer OAuth2 Client Secret Hashing", required: false, targets: ["railway"], category: "security", managementMode: "auto_generate", autoGenerateType: "hex64" },

        // ── amp_managed: AMP speichert + synct zentral ───────────────────────
        { key: "AMP_URL", description: "URL der AMP API", required: true, targets: ["railway", "github"], category: "service", managementMode: "amp_managed" },
        { key: "AMP_API_KEY", description: "AMP API Key fuer Authentifizierung", required: true, targets: ["railway", "github"], category: "auth", managementMode: "amp_managed" },
        { key: "AMP_API_KEY", description: "API Key fuer node-amp Backend", required: true, targets: ["railway", "github"], category: "auth", managementMode: "amp_managed" },
        { key: "TEMPLATE_SYNC_TOKEN", description: "GitHub Token fuer Template-Sync (Pull von node-template)", required: true, targets: ["github"], category: "deployment", managementMode: "amp_managed" },

        // ── amp_managed: AWS (aus Company AWS-Provider) ──────────────────────
        { key: "AWS_ACCESS_KEY_ID", description: "AWS IAM Access Key (aus Company AWS-Provider)", required: true, targets: ["railway"], category: "storage", managementMode: "amp_managed" },
        { key: "AWS_SECRET_ACCESS_KEY", description: "AWS IAM Secret Key (aus Company AWS-Provider)", required: true, targets: ["railway"], category: "storage", managementMode: "amp_managed" },
        { key: "AWS_REGION", description: "AWS Region (aus Company AWS-Provider)", required: true, targets: ["railway"], category: "storage", managementMode: "amp_managed" },
        { key: "AWS_BUCKET_NAME", description: "S3 Bucket Name (aus Company AWS-Provider)", required: true, targets: ["railway"], category: "storage", managementMode: "amp_managed" },

        // ── amp_managed: Double Zero Email (aus Company Vault) ───────────────
        { key: "DOUBLE_ZERO_API_KEY", description: "Double Zero API Key (zentral pro Company)", required: true, targets: ["railway"], category: "email", managementMode: "amp_managed" },
        { key: "DOUBLE_ZERO_API_ROUTE", description: "Double Zero API Route (zentral pro Company)", required: true, targets: ["railway"], category: "email", managementMode: "amp_managed" },
        { key: "EMAIL_FROM", description: "Absender-Adresse — automatisch aus Domain-Wahl (noreply@{domain})", required: true, targets: ["railway"], category: "email", managementMode: "amp_managed" },

        // ══════════════════════════════════════════════════════════════════════
        // customer_managed — Auto-filled (KEIN group = nicht im Onboarding)
        // ══════════════════════════════════════════════════════════════════════
        { key: "HOST_NAME", description: "Application Base URL — automatisch aus Railway-Domain / Custom Domain", required: true, targets: ["railway"], category: "infrastructure", managementMode: "customer_managed" },
        { key: "PUBLIC_URL", description: "Oeffentliche URL der App — automatisch aus HOST_NAME abgeleitet", required: true, targets: ["railway"], category: "infrastructure", managementMode: "customer_managed" },
        { key: "NODE_PORT", description: "Express Server Port — Standard: 8100", required: false, targets: ["railway"], category: "infrastructure", managementMode: "customer_managed" },

        // ── amp_managed: Entitlements Sync (gesetzt durch Connection Orchestrator) ─
        { key: "ENTITLEMENTS_SYNC_API_KEY", description: "API Key fuer Shop Entitlement Sync — automatisch generiert bei Provisioning", required: false, targets: ["railway"], category: "auth", managementMode: "amp_managed" },

        // ══════════════════════════════════════════════════════════════════════
        // customer_managed — Mit group (im Onboarding-Flow)
        //
        // HINWEIS: App-spezifische customer_managed Secrets (z.B. Google OAuth,
        // Shop-Integration, CHD_* fuer Ruleregistry) werden in der jeweiligen
        // App ergaenzt, NICHT hier im Template.
        //
        // Zukuenftige Phasen (siehe NODE_TEMPLATE_PLAN.md):
        //   - FRONTEND_API_KEY + FRONTEND_HOST_NAME → Phase 4 (Multi-App)
        // ══════════════════════════════════════════════════════════════════════
    ],

    /**
     * Interne Backend-Services messen in der Regel keine Content-Limits.
     * Apps die Limits unterstuetzen, ergaenzen diese in ihrem eigenen Manifest.
     */
    supportedLimits: [],

    health: {
        endpoint: "/app-info/health",
        intervalSeconds: 300,
    },
};

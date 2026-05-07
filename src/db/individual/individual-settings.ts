// INDIVIDUAL APP SETTINGS
// This file is NOT synced with the template
// Add your app-specific settings here

import { AppSettingsType } from "@/db/schema";
import fs from 'fs';
import path from 'path';

// Load app name from setup config if available
function getDefaultAppName(): string {
    try {
        const setupConfigPath = path.join(process.cwd(), '.setup-config.json');
        if (fs.existsSync(setupConfigPath)) {
            const config = JSON.parse(fs.readFileSync(setupConfigPath, 'utf-8'));
            return config.appNamePascal || config.appName || "My App";
        }
    } catch (error) {
        console.warn('⚠️  Could not load .setup-config.json, using default app name');
    }
    return "My App";
}

export enum AppSettingsKey {
    ApplicationName = "application_name",
    BillingPlanLimitManagingCompaniesBase = "billing_plan_limit_managing_companies_base",
    BillingPlanLimitManagingCompaniesPremium = "billing_plan_limit_managing_companies_premium",
    BillingPlanLimitManagingCompaniesEnterprise = "billing_plan_limit_managing_companies_enterprise",
    BillingPlanLimitManagingCompaniesLegacy = "billing_plan_limit_managing_companies_legacy",
    BillingPlanLimitDocumentStorageGbBase = "billing_plan_limit_document_storage_gb_base",
    BillingPlanLimitDocumentStorageGbPremium = "billing_plan_limit_document_storage_gb_premium",
    BillingPlanLimitDocumentStorageGbEnterprise = "billing_plan_limit_document_storage_gb_enterprise",
    BillingPlanLimitDocumentStorageGbLegacy = "billing_plan_limit_document_storage_gb_legacy",
    BillingStorageProviderCostEurPerGb = "billing_storage_provider_cost_eur_per_gb",
    BillingStorageCustomerPriceEurPerGb = "billing_storage_customer_price_eur_per_gb",
    BillingStorageHardLimitGbPerCompany = "billing_storage_hard_limit_gb_per_company",
    BillingOverageCurrency = "billing_overage_currency",
    BillingOveragePriceEurPerManagingCompany = "billing_overage_price_eur_per_managing_company",
    BillingOveragePriceEurPerDocumentStorageGb = "billing_overage_price_eur_per_document_storage_gb",
    BillingOverageNegativeCorrectionsEnabled = "billing_overage_negative_corrections_enabled",
    BillingOveragePullDefaultLookbackDays = "billing_overage_pull_default_lookback_days",
    BillingOveragePullMaxEvents = "billing_overage_pull_max_events",

    // ─── Mahnwesen: Globale Admin-Parameter ───────────────────────────────────
    /**
     * Basiszinssatz nach §247 BGB (in Dezimalform, z.B. "-0.0088" für -0,88%).
     * Wird von der Deutschen Bundesbank halbjährlich veröffentlicht (01.01. und 01.07.).
     * Admins müssen diesen Wert manuell nach jeder Veröffentlichung aktualisieren.
     * Dieser Wert wird als globaler Fallback für alle Companies genutzt.
     * Companies können ihren eigenen Wert in den Dunning-Settings überschreiben.
     *
     * Aktuell (Stand 01.01.2024): -0,83% → Wert: "-0.0083"
     * Quelle: https://www.bundesbank.de/de/aufgaben/geldpolitik/offenmarktgeschaefte/basiszinssatz
     */
    DunningGlobalBaseRateBGB247 = "dunning_global_base_rate_bgb_247",

    /**
     * Ob das Zahlungserinnerungs-Feature (Level 0, freundliche Erinnerung)
     * global aktiv ist. Einzelne Companies können es zusätzlich in ihren
     * Dunning-Settings aktivieren/deaktivieren.
     * Wert: "true" | "false"
     */
    DunningPaymentReminderEnabled = "dunning_payment_reminder_enabled",

    /**
     * Standard-Anzahl Tage nach Fälligkeit für die Zahlungserinnerung (Level 0).
     * Kann pro Company in den Dunning-Settings überschrieben werden.
     * Empfehlung: 3–7 Tage. Default: 3.
     */
    DunningPaymentReminderAfterDays = "dunning_payment_reminder_after_days",
}

export type AppSettingsTypeMap = {
    [AppSettingsKey.ApplicationName]: string;
    [AppSettingsKey.BillingPlanLimitManagingCompaniesBase]: number;
    [AppSettingsKey.BillingPlanLimitManagingCompaniesPremium]: number;
    [AppSettingsKey.BillingPlanLimitManagingCompaniesEnterprise]: number;
    [AppSettingsKey.BillingPlanLimitManagingCompaniesLegacy]: number;
    [AppSettingsKey.BillingPlanLimitDocumentStorageGbBase]: number;
    [AppSettingsKey.BillingPlanLimitDocumentStorageGbPremium]: number;
    [AppSettingsKey.BillingPlanLimitDocumentStorageGbEnterprise]: number;
    [AppSettingsKey.BillingPlanLimitDocumentStorageGbLegacy]: number;
    [AppSettingsKey.BillingStorageProviderCostEurPerGb]: number;
    [AppSettingsKey.BillingStorageCustomerPriceEurPerGb]: number;
    [AppSettingsKey.BillingStorageHardLimitGbPerCompany]: number;
    [AppSettingsKey.BillingOverageCurrency]: string;
    [AppSettingsKey.BillingOveragePriceEurPerManagingCompany]: number;
    [AppSettingsKey.BillingOveragePriceEurPerDocumentStorageGb]: number;
    [AppSettingsKey.BillingOverageNegativeCorrectionsEnabled]: boolean;
    [AppSettingsKey.BillingOveragePullDefaultLookbackDays]: number;
    [AppSettingsKey.BillingOveragePullMaxEvents]: number;
    // Dunning
    [AppSettingsKey.DunningGlobalBaseRateBGB247]: number;
    [AppSettingsKey.DunningPaymentReminderEnabled]: boolean;
    [AppSettingsKey.DunningPaymentReminderAfterDays]: number;
};

export const defaultAppSettings: {
    key: AppSettingsKey;
    value: string;
    type: AppSettingsType;
    allowedValues?: string; // Comma-separated list for "select" type
    description?: string;
}[] = [
        {
            key: AppSettingsKey.ApplicationName,
            value: getDefaultAppName(),
            type: "string",
            description: "Name der Anwendung, wird in E-Mails und Rechnungen verwendet",
        },
        {
            key: AppSettingsKey.BillingPlanLimitManagingCompaniesBase,
            value: "1",
            type: "number",
            description: "Plan-Limit: Anzahl Managing Companies im Base-Plan",
        },
        {
            key: AppSettingsKey.BillingPlanLimitManagingCompaniesPremium,
            value: "3",
            type: "number",
            description: "Plan-Limit: Anzahl Managing Companies im Premium-Plan",
        },
        {
            key: AppSettingsKey.BillingPlanLimitManagingCompaniesEnterprise,
            value: "-1",
            type: "number",
            description: "Plan-Limit: Anzahl Managing Companies im Enterprise-Plan (-1 = unlimited)",
        },
        {
            key: AppSettingsKey.BillingPlanLimitManagingCompaniesLegacy,
            value: "-1",
            type: "number",
            description: "Plan-Limit: Anzahl Managing Companies im Legacy-Fallback (-1 = unlimited)",
        },
        {
            key: AppSettingsKey.BillingPlanLimitDocumentStorageGbBase,
            value: "5",
            type: "number",
            description: "Plan-Limit: Dokument-Speicher (GB) im Base-Plan",
        },
        {
            key: AppSettingsKey.BillingPlanLimitDocumentStorageGbPremium,
            value: "50",
            type: "number",
            description: "Plan-Limit: Dokument-Speicher (GB) im Premium-Plan",
        },
        {
            key: AppSettingsKey.BillingPlanLimitDocumentStorageGbEnterprise,
            value: "-1",
            type: "number",
            description: "Plan-Limit: Dokument-Speicher (GB) im Enterprise-Plan (-1 = unlimited)",
        },
        {
            key: AppSettingsKey.BillingPlanLimitDocumentStorageGbLegacy,
            value: "-1",
            type: "number",
            description: "Plan-Limit: Dokument-Speicher (GB) im Legacy-Fallback (-1 = unlimited)",
        },
        {
            key: AppSettingsKey.BillingStorageProviderCostEurPerGb,
            value: "0.023",
            type: "number",
            description: "Interne Kosten pro GB/Monat (Provider-Kosten)",
        },
        {
            key: AppSettingsKey.BillingStorageCustomerPriceEurPerGb,
            value: "0.080",
            type: "number",
            description: "Kundenpreis pro GB/Monat (für Marge-Berechnung)",
        },
        {
            key: AppSettingsKey.BillingStorageHardLimitGbPerCompany,
            value: "-1",
            type: "number",
            description: "Optionales absolutes Hard-Limit pro Company in GB (-1 = deaktiviert)",
        },
        {
            key: AppSettingsKey.BillingOverageCurrency,
            value: "EUR",
            type: "select",
            allowedValues: "EUR,USD,GBP,CHF",
            description: "Währung für Overage-Events",
        },
        {
            key: AppSettingsKey.BillingOveragePriceEurPerManagingCompany,
            value: "9.90",
            type: "number",
            description: "Overage-Preis pro zusätzlicher Managing Company",
        },
        {
            key: AppSettingsKey.BillingOveragePriceEurPerDocumentStorageGb,
            value: "0.120",
            type: "number",
            description: "Overage-Preis pro zusätzlich genutztem GB Dokument-Speicher",
        },
        {
            key: AppSettingsKey.BillingOverageNegativeCorrectionsEnabled,
            value: "true",
            type: "boolean",
            description: "Erlaubt negative Korrektur-Events bei sinkender Usage",
        },
        {
            key: AppSettingsKey.BillingOveragePullDefaultLookbackDays,
            value: "120",
            type: "number",
            description: "Standard-Lookback in Tagen für Overage-Pull",
        },
        {
            key: AppSettingsKey.BillingOveragePullMaxEvents,
            value: "2000",
            type: "number",
            description: "Maximale Anzahl Overage-Events pro Pull-Response",
        },

        // ─── Mahnwesen ────────────────────────────────────────────────────────────
        {
            key: AppSettingsKey.DunningGlobalBaseRateBGB247,
            value: "-0.0083",
            type: "number",
            description:
                "Basiszinssatz §247 BGB (Dezimalform, z.B. -0.0083 = -0,83%). " +
                "Halbjährlich von der Deutschen Bundesbank veröffentlicht. " +
                "Muss manuell nach jeder Bundesbank-Veröffentlichung (01.01. und 01.07.) aktualisiert werden. " +
                "Quelle: https://www.bundesbank.de/basiszinssatz",
        },
        {
            key: AppSettingsKey.DunningPaymentReminderEnabled,
            value: "true",
            type: "boolean",
            description:
                "Global-Flag: Ob Zahlungserinnerungen (Level 0, freundliche Erinnerung vor der 1. Mahnung) " +
                "angeboten werden. Einzelne Companies können das Feature zusätzlich in ihren Dunning-Settings konfigurieren.",
        },
        {
            key: AppSettingsKey.DunningPaymentReminderAfterDays,
            value: "3",
            type: "number",
            description:
                "Standard-Wartezeit in Tagen nach Fälligkeit, nach der eine Zahlungserinnerung vorgeschlagen wird. " +
                "Empfehlung: 3–7 Tage. Companies können diesen Wert in den Dunning-Settings überschreiben.",
        },
    ];

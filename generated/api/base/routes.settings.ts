// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-04T18:32:46.348Z
// Run `pnpm run api:generate` to regenerate

import type { AppSettings } from "../../frontend-types";

export type SettingsListParams = undefined;
export type SettingsListQuery = {

};
export type SettingsListBody = undefined;
export type SettingsListResponseData = { settings: AppSettings[]; canEdit: boolean };
export type SettingsListResponse = import("../types").ApiEnvelope<SettingsListResponseData>;

export type SettingsUpdateParams = {
  settingId: number;
  key: "application_name" | "billing_plan_limit_managing_companies_base" | "billing_plan_limit_managing_companies_premium" | "billing_plan_limit_managing_companies_enterprise" | "billing_plan_limit_managing_companies_legacy" | "billing_plan_limit_document_storage_gb_base" | "billing_plan_limit_document_storage_gb_premium" | "billing_plan_limit_document_storage_gb_enterprise" | "billing_plan_limit_document_storage_gb_legacy" | "billing_storage_provider_cost_eur_per_gb" | "billing_storage_customer_price_eur_per_gb" | "billing_storage_hard_limit_gb_per_company" | "billing_overage_currency" | "billing_overage_price_eur_per_managing_company" | "billing_overage_price_eur_per_document_storage_gb" | "billing_overage_negative_corrections_enabled" | "billing_overage_pull_default_lookback_days" | "billing_overage_pull_max_events" | "dunning_global_base_rate_bgb_247" | "dunning_payment_reminder_enabled" | "dunning_payment_reminder_after_days";
};
export type SettingsUpdateQuery = undefined;
export type SettingsUpdateBody = {
  value: string | number | boolean | Array<any> | Record<string, any> | null;
};
export type SettingsUpdateResponseData = AppSettings;
export type SettingsUpdateResponse = import("../types").ApiEnvelope<SettingsUpdateResponseData>;

export const apiRoutes_settings = {
  "settings_list": {
    method: "GET",
    path: "/settings/getAll",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["settings"],
      summary: "List app settings",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: SettingsListParams;
      query: SettingsListQuery;
      body: SettingsListBody;
      response: SettingsListResponse;
      responseData: SettingsListResponseData;
    },
  },
  "settings_update": {
    method: "PUT",
    path: "/settings/update/:settingId/:key",
    auth: {"type":"frontend_permission_http","permission":"settings_edit"},
    meta: {
      tags: ["settings"],
      summary: "Update one app setting",
      bodyContentType: "application/json",
      validated: {"params":true,"query":false,"body":true},
    },
    types: null as unknown as {
      params: SettingsUpdateParams;
      query: SettingsUpdateQuery;
      body: SettingsUpdateBody;
      response: SettingsUpdateResponse;
      responseData: SettingsUpdateResponseData;
    },
  },
} as const;
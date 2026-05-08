// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.141Z
// Run `pnpm run api:generate` to regenerate

export * from "./types";
export * from "./catalog";
export * from "./base/routes.api";
export * from "./base/routes.app_info";
export * from "./base/routes.auth";
export * from "./base/routes.entitlements";
export * from "./base/routes.jobs";
export * from "./base/routes.logs";
export * from "./base/routes.oauth2";
export * from "./base/routes.permissions";
export * from "./base/routes.roles";
export * from "./features/routes.secu_engagements";
export * from "./features/routes.secu_entities";
export * from "./features/routes.secu_hints";
export * from "./features/routes.secu_playbooks";
export * from "./features/routes.secu_rules";
export * from "./features/routes.secu_workers";
export * from "./base/routes.settings";
export * from "./base/routes.user_activity";
export * from "./base/routes.users";
export * from "./base/routes.webhooks";

import type { ApiEnvelope } from "./types";
import { apiRoutes_api } from "./base/routes.api";
import { apiRoutes_app_info } from "./base/routes.app_info";
import { apiRoutes_auth } from "./base/routes.auth";
import { apiRoutes_entitlements } from "./base/routes.entitlements";
import { apiRoutes_jobs } from "./base/routes.jobs";
import { apiRoutes_logs } from "./base/routes.logs";
import { apiRoutes_oauth2 } from "./base/routes.oauth2";
import { apiRoutes_permissions } from "./base/routes.permissions";
import { apiRoutes_roles } from "./base/routes.roles";
import { apiRoutes_secu_engagements } from "./features/routes.secu_engagements";
import { apiRoutes_secu_entities } from "./features/routes.secu_entities";
import { apiRoutes_secu_hints } from "./features/routes.secu_hints";
import { apiRoutes_secu_playbooks } from "./features/routes.secu_playbooks";
import { apiRoutes_secu_rules } from "./features/routes.secu_rules";
import { apiRoutes_secu_workers } from "./features/routes.secu_workers";
import { apiRoutes_settings } from "./base/routes.settings";
import { apiRoutes_user_activity } from "./base/routes.user_activity";
import { apiRoutes_users } from "./base/routes.users";
import { apiRoutes_webhooks } from "./base/routes.webhooks";

export const apiRoutes = {
  ...apiRoutes_api,
  ...apiRoutes_app_info,
  ...apiRoutes_auth,
  ...apiRoutes_entitlements,
  ...apiRoutes_jobs,
  ...apiRoutes_logs,
  ...apiRoutes_oauth2,
  ...apiRoutes_permissions,
  ...apiRoutes_roles,
  ...apiRoutes_secu_engagements,
  ...apiRoutes_secu_entities,
  ...apiRoutes_secu_hints,
  ...apiRoutes_secu_playbooks,
  ...apiRoutes_secu_rules,
  ...apiRoutes_secu_workers,
  ...apiRoutes_settings,
  ...apiRoutes_user_activity,
  ...apiRoutes_users,
  ...apiRoutes_webhooks,
} as const;

export type ApiRouteKey = keyof typeof apiRoutes;
export type ApiRoute<K extends ApiRouteKey> = (typeof apiRoutes)[K];
export type ApiRequest<K extends ApiRouteKey> = ApiRoute<K>["types"];
export type ApiResponse<K extends ApiRouteKey> = ApiRoute<K>["types"]["response"];
export type ApiResponseData<K extends ApiRouteKey> = ApiRoute<K>["types"]["responseData"];

export type { ApiEnvelope };
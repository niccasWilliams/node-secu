// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.142Z
// Run `pnpm run api:generate` to regenerate

export type RouteGroup = { key: string; module: string };

export const apiMountPrefixes = {
  base: [
  "/api/amp-proxy",
  "/api/entitlements",
  "/app-info",
  "/app-logs",
  "/auth",
  "/cron-jobs",
  "/entitlements",
  "/oauth",
  "/permissions",
  "/role-assignments",
  "/roles",
  "/settings",
  "/user-activity",
  "/users",
  "/webhooks"
],
  features: [
  "/engagements",
  "/entities",
  "/rules"
],
} as const;

export const apiGroups = {
  base: [
  {
    "key": "api",
    "module": "./routes.api"
  },
  {
    "key": "auth",
    "module": "./routes.auth"
  },
  {
    "key": "entitlements",
    "module": "./routes.entitlements"
  },
  {
    "key": "permissions",
    "module": "./routes.permissions"
  },
  {
    "key": "roles",
    "module": "./routes.roles"
  },
  {
    "key": "settings",
    "module": "./routes.settings"
  },
  {
    "key": "users",
    "module": "./routes.users"
  },
  {
    "key": "webhooks",
    "module": "./routes.webhooks"
  }
] as RouteGroup[],
  features: [] as RouteGroup[],
  all: [
  {
    "key": "api",
    "module": "./base/routes.api"
  },
  {
    "key": "app_info",
    "module": "./base/routes.app_info"
  },
  {
    "key": "auth",
    "module": "./base/routes.auth"
  },
  {
    "key": "entitlements",
    "module": "./base/routes.entitlements"
  },
  {
    "key": "jobs",
    "module": "./base/routes.jobs"
  },
  {
    "key": "logs",
    "module": "./base/routes.logs"
  },
  {
    "key": "oauth2",
    "module": "./base/routes.oauth2"
  },
  {
    "key": "permissions",
    "module": "./base/routes.permissions"
  },
  {
    "key": "roles",
    "module": "./base/routes.roles"
  },
  {
    "key": "secu_engagements",
    "module": "./features/routes.secu_engagements"
  },
  {
    "key": "secu_entities",
    "module": "./features/routes.secu_entities"
  },
  {
    "key": "secu_hints",
    "module": "./features/routes.secu_hints"
  },
  {
    "key": "secu_playbooks",
    "module": "./features/routes.secu_playbooks"
  },
  {
    "key": "secu_rules",
    "module": "./features/routes.secu_rules"
  },
  {
    "key": "secu_workers",
    "module": "./features/routes.secu_workers"
  },
  {
    "key": "settings",
    "module": "./base/routes.settings"
  },
  {
    "key": "user_activity",
    "module": "./base/routes.user_activity"
  },
  {
    "key": "users",
    "module": "./base/routes.users"
  },
  {
    "key": "webhooks",
    "module": "./base/routes.webhooks"
  }
] as RouteGroup[],
} as const;

/**
 * Hinweis:
 * - Diese Klassifikation ist best-effort (Prefix->GroupKey).
 * - Für exakte Zuordnung nutzt ihr am besten die Route-Pfade in openapi.json.
 */

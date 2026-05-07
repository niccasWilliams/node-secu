
import { AppPermissionValue } from "@/routes/auth/roles/permissions/permission.service";
import { desc, relations, sql } from "drizzle-orm";
import { int } from "drizzle-orm/mysql-core";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  varchar,
  json,
  unique,
  date,
  jsonb,
} from "drizzle-orm/pg-core";

export const appSettingsTypeEnum = pgEnum("app_settings_type", ["string", "number", "boolean", "json", "select"]);
export const webhookStatusEnum = pgEnum("webhook_status", ["pending", "processed", "failed", "skipped"]);
export const appLogLevelEnum = pgEnum("app_log_level", ["info", "warn", "error", "debug", "fatal", "critical"]);
export const roleAssignmentStatusEnum = pgEnum("role_assignment_status", ["active", "expired", "revoked"]);
export const entitlementSyncTypeEnum = pgEnum("entitlement_sync_type", ["role", "area"]);
export const entitlementSyncOperationEnum = pgEnum("entitlement_sync_operation", ["assign", "update", "revoke", "state_check"]);

export const workflowQueueStatusEnum = pgEnum("workflow_queue_status", ["pending", "processing", "completed", "failed", "canceled"]);
export const workflowCreatedByEnum = pgEnum("workflow_created_by", ["user", "system"]);



export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  externalUserId: text("external_user_id"),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  // direct-auth fields (null in williams-mode)
  passwordHash: text("password_hash"),
  name: text("name"),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at"),
})

// direct-auth: single-use email-verification tokens (TTL ~24h)
export const authEmailVerificationTokens = pgTable("auth_email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  tokenHashUnique: unique("auth_email_verification_tokens_token_hash_unique").on(table.tokenHash),
  userIdx: index("auth_email_verification_tokens_user_idx").on(table.userId),
}))

// direct-auth: refresh-token allowlist with rotation + reuse-detection
export const authRefreshTokens = pgTable("auth_refresh_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  replacedByTokenHash: text("replaced_by_token_hash"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  tokenHashIdx: unique("auth_refresh_tokens_token_hash_unique").on(table.tokenHash),
  userIdx: index("auth_refresh_tokens_user_idx").on(table.userId),
}))

// direct-auth: device push tokens (Expo / FCM / APNs)
export const authPushTokens = pgTable("auth_push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull(),
  platform: text("platform").notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
}, (table) => ({
  tokenUnique: unique("auth_push_tokens_token_unique").on(table.token),
  userIdx: index("auth_push_tokens_user_idx").on(table.userId),
}))

export const userActivities = pgTable("user_activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  activityDate: date("activity_date").notNull(), // Date of activity (YYYY-MM-DD)
  firstActivityAt: timestamp("first_activity_at").notNull(), // First request of the day
  lastActivityAt: timestamp("last_activity_at").notNull(), // Last request of the day (updated continuously)
  requestCount: integer("request_count").notNull().default(0), // Total requests this day
  requests: jsonb("requests").notNull().default([]), // Array of request details (max 50, FIFO)
  createdAt: timestamp("created_at").notNull(), // When this daily record was created
  updatedAt: timestamp("updated_at").notNull(), // When this daily record was last updated
}, (table) => ({
  userIdx: index("user_activity_user_idx").on(table.userId),
  activityDateIdx: index("user_activity_date_idx").on(table.activityDate),
  userDateIdx: index("user_activity_user_date_idx").on(table.userId, table.activityDate),
  // Unique constraint: one entry per user per day
  uniqueUserDate: unique("user_activity_unique_user_date").on(table.userId, table.activityDate),
}))






export const appLogs = pgTable("app_logs", {
  id: serial("id").primaryKey(),
  level: appLogLevelEnum("level").notNull(),
  message: text("message").notNull(),
  context: jsonb("context").default({}),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  levelIdx: index("app_log_level_idx").on(table.level),
  createdAtIdx: index("app_log_created_at_idx").on(table.createdAt),
}));


//WEBHOOKS ############################################################################################################
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(), // z. B. "Stripe", "PayPal", "Printful"
  eventType: text("event_type").notNull(),
  externalId: text("external_id").notNull(),
  payload: jsonb("payload").notNull(), // Raw payload as received from the provider
  processed: boolean("processed").notNull().default(false),
  status: webhookStatusEnum("status").notNull().default("pending"),
  processMessage: text("process_message"),
  originUrl: text("origin_url"),
  createdAt: timestamp("created_at").notNull(),
  processedAt: timestamp("processed_at"),
  userAgent: text("user_agent"), // User-Agent Header
  signature: text("signature"), // Webhook signature für Verifizierung
  retryCount: integer("retry_count").notNull().default(0), // Anzahl der Retry-Versuche
  lastRetryAt: timestamp("last_retry_at"), // Letzter Retry-Versuch
}, (table) => ({
  externalIdIdx: index("webhook_external_id_idx").on(table.externalId),
  providerEventIdx: index("webhook_provider_event_idx").on(table.provider, table.eventType),
}));



//ROLES ############################################################################################################
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
}, (table) => ({
  uniqueName: unique("unique_permission_name").on(table.name),
}));

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  permissionId: integer("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
  assignedBy: integer("assigned_by").references(() => users.id, { onDelete: "set null" }).notNull(),
  revokedBy: integer("revoked_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull(),
  validTo: timestamp("valid_to"),
}, (table) => ({
  roleIdx: index("role_permission_role_idx").on(table.roleId),
  permissionIdx: index("role_permission_permission_idx").on(table.permissionId),
}));


export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull(),
  isSellable: boolean("is_sellable").notNull().default(false), // Kann diese Rolle verkauft werden, oder ist die nur durch admin steuerbar? 
});

export const roleAssignments = pgTable("role_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: roleAssignmentStatusEnum("status").notNull(),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to"),
  assignedBy: integer("assigned_by").references(() => users.id, { onDelete: "set null" }).notNull(),
  revokedBy: integer("revoked_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  userIdx: index("role_assignment_user_idx").on(table.userId),
  roleIdx: index("role_assignment_role_idx").on(table.roleId),
}));

export const entitlementSyncLinks = pgTable("entitlement_sync_links", {
  id: serial("id").primaryKey(),
  linkKey: text("link_key").notNull().unique(),
  externalUserId: text("external_user_id").notNull(),
  externalIdentifier: text("external_identifier").notNull(),
  entitlementType: entitlementSyncTypeEnum("entitlement_type").notNull(),

  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  roleId: integer("role_id").references(() => roles.id, { onDelete: "set null" }),
  roleAssignmentId: integer("role_assignment_id").references(() => roleAssignments.id, { onDelete: "set null" }),

  shopSyncVersion: text("shop_sync_version"),
  shopAssignmentId: text("shop_assignment_id"),
  shopEntitlementId: text("shop_entitlement_id"),
  shopCustomerId: text("shop_customer_id"),
  shopOrderId: text("shop_order_id"),
  shopOrderItemId: text("shop_order_item_id"),
  sourceAppId: text("source_app_id"),
  sourceTargetAppId: text("source_target_app_id"),
  sourceClientId: text("source_client_id"),

  lastOperation: entitlementSyncOperationEnum("last_operation"),
  isActive: boolean("is_active").notNull().default(true),
  validFrom: timestamp("valid_from"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),

  context: jsonb("context").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
}, (table) => ({
  shopAssignmentUnique: unique("entitlement_sync_shop_assignment_unique").on(table.shopAssignmentId),
  linkKeyIdx: index("entitlement_sync_link_key_idx").on(table.linkKey),
  shopAssignmentIdIdx: index("entitlement_sync_shop_assignment_id_idx").on(table.shopAssignmentId),
  externalTupleIdx: index("entitlement_sync_external_tuple_idx").on(table.externalUserId, table.externalIdentifier, table.entitlementType),
  userRoleIdx: index("entitlement_sync_user_role_idx").on(table.userId, table.roleId),
}));

export const usageOverageEvents = pgTable("usage_overage_events", {
  id: serial("id").primaryKey(),
  externalEventId: text("external_event_id").notNull().unique(),
  sourceFingerprint: text("source_fingerprint").notNull().unique(),
  externalUserId: text("external_user_id").notNull(),
  shopAssignmentId: text("shop_assignment_id"),
  externalIdentifier: text("external_identifier").notNull(),
  entitlementType: entitlementSyncTypeEnum("entitlement_type").notNull(),
  metricKey: text("metric_key").notNull(),
  unit: text("unit").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  includedQuantity: numeric("included_quantity").notNull(),
  usedQuantity: numeric("used_quantity").notNull(),
  overageQuantity: numeric("overage_quantity").notNull(),
  overageAmount: numeric("overage_amount").notNull(),
  currency: text("currency").notNull().default("EUR"),
  note: text("note"),
  pricingPayload: jsonb("pricing_payload").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  externalEventIdIdx: index("usage_overage_external_event_id_idx").on(table.externalEventId),
  shopAssignmentIdIdx: index("usage_overage_shop_assignment_id_idx").on(table.shopAssignmentId),
  tupleMetricPeriodIdx: index("usage_overage_tuple_metric_period_idx").on(
    table.externalUserId,
    table.externalIdentifier,
    table.entitlementType,
    table.metricKey,
    table.periodStart,
    table.periodEnd
  ),
  occurredAtIdx: index("usage_overage_occurred_at_idx").on(table.occurredAt),
}));



// ============ SHOP CREDIT/LIMIT SYNC ============
// Local mirror of shop credit/limit state for resilient operation when shop is unreachable

export const creditConsumptionStatusEnum = pgEnum("credit_consumption_status", ["pending", "synced", "failed"]);

/**
 * Local mirror of entitlement limit configs pushed by the shop.
 * Updated via entitlement assignment webhook and credit-update webhook.
 */
export const shopLimitConfigs = pgTable("shop_limit_configs", {
  id: serial("id").primaryKey(),
  externalUserId: text("external_user_id").notNull(),
  metricKey: text("metric_key").notNull(),
  includedQuantity: numeric("included_quantity").notNull().default("0"),
  limitBehavior: text("limit_behavior").notNull().default("soft_warn"),
  payAsYouGoActive: boolean("pay_as_you_go_active").notNull().default(false),
  maxOverageQuantity: numeric("max_overage_quantity"),
  overagePricePerUnit: numeric("overage_price_per_unit"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userMetricUnique: unique("shop_limit_configs_user_metric_unique").on(table.externalUserId, table.metricKey),
}));

/**
 * Local mirror of credit pool balances pushed by the shop.
 * App decrements locally and syncs consumption back to shop.
 */
export const shopCreditBalances = pgTable("shop_credit_balances", {
  id: serial("id").primaryKey(),
  externalUserId: text("external_user_id").notNull(),
  metricKey: text("metric_key").notNull(),
  totalRemaining: numeric("total_remaining").notNull().default("0"),
  localUsed: numeric("local_used").notNull().default("0"),
  lastShopSync: timestamp("last_shop_sync"),
  pools: jsonb("pools").notNull().default([]),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userMetricUnique: unique("shop_credit_balances_user_metric_unique").on(table.externalUserId, table.metricKey),
}));

/**
 * Queue of credit consumption events to sync back to the shop.
 * Each entry = one local deduction that needs confirmation by the shop.
 */
export const creditConsumptionQueue = pgTable("credit_consumption_queue", {
  id: serial("id").primaryKey(),
  externalUserId: text("external_user_id").notNull(),
  metricKey: text("metric_key").notNull(),
  amount: numeric("amount").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: creditConsumptionStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  shopResponse: jsonb("shop_response"),
  lastAttemptAt: timestamp("last_attempt_at"),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  statusIdx: index("credit_consumption_queue_status_idx").on(table.status),
}));


export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: varchar("value").notNull(),
  allowedValues: text("allowed_values"), // Comma-separated list of allowed values (for enum-like settings)
  type: appSettingsTypeEnum("type").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull(),
}, (table) => ({
  keyIdx: index("app_settings_key_idx").on(table.key),
}));




// WORKFLOW QUEUE ############################################################################################################
export const workflowQueue = pgTable("workflow_queue", {
  id: text("id").primaryKey(), // String format: WF_<timestamp>_<hash>
  workflowType: text("workflow_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: workflowQueueStatusEnum("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  tasks: jsonb("tasks").notNull().default([]), // Array of tasks with expected duration
  currentTask: integer("current_task").notNull().default(0), // Current task being processed
  taskResults: jsonb("task_results").notNull().default([]), // Array of task results/details (logs go here, so we can see everything..)
  createdAt: timestamp("created_at").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  updatedAt: timestamp("updated_at"),
  priority: integer("priority").notNull().default(0), // Higher number = higher priority
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  createdBy: workflowCreatedByEnum("created_by").notNull().default("system"),

  // Abort & Cleanup System
  abortRequested: boolean("abort_requested").default(false), // User requested abort
  cleanupHandler: varchar("cleanup_handler", { length: 255 }), // Cleanup function identifier
  timeoutAt: timestamp("timeout_at"), // Automatic timeout timestamp
}, (table) => ({
  statusIdx: index("workflow_queue_status_idx").on(table.status),
  workflowTypeIdx: index("workflow_queue_workflow_type_idx").on(table.workflowType),
  createdAtIdx: index("workflow_queue_created_at_idx").on(table.createdAt),
  userIdIdx: index("workflow_queue_user_id_idx").on(table.userId),
  statusTypeIdx: index("workflow_queue_status_type_idx").on(table.status, table.workflowType),
  // Abort check optimization
  abortIdx: index("workflow_queue_abort_idx").on(table.id, table.abortRequested),
  // Timeout check optimization
  timeoutIdx: index("workflow_queue_timeout_idx").on(table.timeoutAt, table.status),
}));


// ============================================================================
// OAUTH2 - Enterprise authentication system
// ============================================================================
// Import OAuth2 schemas (tables + types)
export * from "@/routes/oauth2/oauth2-client.schema";



/**
 * TYPES
 *
 * You can create and export types from your schema to use in your application.
 * This is useful when you need to know the shape of the data you are working with
 * in a component or function.
 */

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type UserId = typeof users.$inferSelect['id'];
export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type AuthRefreshTokenInsert = typeof authRefreshTokens.$inferInsert;
export type AuthPushToken = typeof authPushTokens.$inferSelect;
export type AuthPushTokenInsert = typeof authPushTokens.$inferInsert;
export type AuthEmailVerificationToken = typeof authEmailVerificationTokens.$inferSelect;
export type AuthEmailVerificationTokenInsert = typeof authEmailVerificationTokens.$inferInsert;

// Public response shapes for the direct-auth (`AUTH_MODE=direct`) endpoints.
// Hand-rolled so the frontend-types generator picks them up alongside the
// other type aliases in this file (UserWithStats, etc.).
export type DirectAuthUser = {
  id: number;
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export type DirectAuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type DirectAuthResponse = {
  user: DirectAuthUser;
  accessToken: string;
  refreshToken: string;
};

export type DirectAuthVerifyEmailResponse = {
  ok: true;
  user: DirectAuthUser;
};

export type DirectAuthRequestVerificationResponse = {
  ok: true;
  alreadyVerified?: boolean;
};
export type UserActivity = typeof userActivities.$inferInsert;
export type UserActivityId = typeof userActivities.$inferSelect['id'];
export type AppSettings = typeof appSettings.$inferInsert;
export type AppSettingsInsert = typeof appSettings.$inferInsert;
export type AppSettingsId = typeof appSettings.$inferSelect['id'];
export type AppSettingsType = typeof appSettingsTypeEnum.enumValues[number];



export type AppLog = typeof appLogs.$inferSelect;
export type AppLogId = typeof appLogs.$inferSelect['id'];
export type AppLogLevel = typeof appLogLevelEnum.enumValues[number];


export type Webhook = typeof webhooks.$inferSelect;
export type WebhookStatus = typeof webhookStatusEnum.enumValues[number];
export type WebhookId = typeof webhooks.$inferSelect['id'];


export type Permission = typeof permissions.$inferSelect;
export type PermissionId = typeof permissions.$inferSelect["id"];
export type Role = typeof roles.$inferSelect;
export type RoleId = typeof roles.$inferSelect["id"];
export type RolePermission = typeof rolePermissions.$inferSelect;
export type RolePermissionId = typeof rolePermissions.$inferSelect["id"];
export type RoleAssignment = typeof roleAssignments.$inferSelect;
export type RoleAssignmentId = typeof roleAssignments.$inferSelect["id"];
export type RoleAssignmentStatus = typeof roleAssignmentStatusEnum.enumValues[number];
export type EntitlementSyncLink = typeof entitlementSyncLinks.$inferSelect;
export type EntitlementSyncLinkId = typeof entitlementSyncLinks.$inferSelect["id"];
export type EntitlementSyncType = typeof entitlementSyncTypeEnum.enumValues[number];
export type EntitlementSyncOperation = typeof entitlementSyncOperationEnum.enumValues[number];
export type UsageOverageEvent = typeof usageOverageEvents.$inferSelect;
export type UsageOverageEventId = typeof usageOverageEvents.$inferSelect["id"];
export type ShopLimitConfig = typeof shopLimitConfigs.$inferSelect;
export type ShopLimitConfigInsert = typeof shopLimitConfigs.$inferInsert;
export type ShopCreditBalance = typeof shopCreditBalances.$inferSelect;
export type ShopCreditBalanceInsert = typeof shopCreditBalances.$inferInsert;
export type CreditConsumptionQueueEntry = typeof creditConsumptionQueue.$inferSelect;
export type CreditConsumptionQueueInsert = typeof creditConsumptionQueue.$inferInsert;

export type WorkflowQueue = typeof workflowQueue.$inferSelect;
export type WorkflowQueueId = typeof workflowQueue.$inferSelect['id'];
export type WorkflowQueueStatus = typeof workflowQueueStatusEnum.enumValues[number];
export type WorkflowCreatedBy = typeof workflowCreatedByEnum.enumValues[number];


export type QuickStats = {
  lastActivity: string | null;
  requestsToday: number;
  requestsThisWeek: number;
  requestsThisMonth: number;
};

export type UserWithStats = {
  user: {
    id: number;
    externalUserId: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
    updatedAt: Date | null;
  };
  activityStats: QuickStats | null;
};

export type UserWithActivityOverview = {
  user: {
    id: number;
    externalUserId: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    createdAt: Date;
    updatedAt: Date | null;
  };
  activityOverview: any;
};

export type PaginatedUsersWithActivityOverview = {
  data: UserWithActivityOverview[];
  pagination: {
    page: number;
    resultsPerPage: number;
    totalPages: number;
    totalResults: number;
    availableStatusCodes: number[];
  };
};











// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T09:33:00.470Z
// Run `npm run types:generate` to regenerate this file

// ============================================================================
// ENUMS & LITERAL TYPES
// ============================================================================

export type AppSettingsType = 'string' | 'number' | 'boolean' | 'json' | 'select';
export type WebhookStatus = 'pending' | 'processed' | 'failed' | 'skipped';
export type AppLogLevel = 'info' | 'warn' | 'error' | 'debug' | 'fatal' | 'critical';
export type RoleAssignmentStatus = 'active' | 'expired' | 'revoked';
export type EntitlementSyncType = 'role' | 'area';
export type EntitlementSyncOperation = 'assign' | 'update' | 'revoke' | 'state_check';
export type WorkflowQueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
export type WorkflowCreatedBy = 'user' | 'system';
export type CreditConsumptionStatus = 'pending' | 'synced' | 'failed';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AuthorizationScope = 'passive_only' | 'active_safe' | 'active_intrusive';
export type AuthorizationKind = 'own' | 'verified_ownership' | 'written_consent' | 'internal_lab';
export type AuthorizationProofType = 'dns_txt' | 'http_file' | 'written_contract' | 'manual_owner_verification' | 'none';
export type EngagementKind = 'solo_lab' | 'ctf' | 'bug_bounty' | 'customer_pentest' | 'internal';
export type EngagementStatus = 'planning' | 'active' | 'paused' | 'completed' | 'archived';
export type EntityKind = 'asset_domain' | 'asset_subdomain' | 'asset_ip' | 'asset_host' | 'asset_url' | 'person' | 'organization' | 'location' | 'credential_ref' | 'document' | 'email_address' | 'username' | 'phone_number' | 'social_account';
export type EngagementEntityRole = 'primary_target' | 'in_scope' | 'out_of_scope' | 'pivot' | 'context';
export type FindingStatus = 'open' | 'triaged' | 'confirmed' | 'false_positive' | 'fixed';
export type FindingCategory = 'dns' | 'email_security' | 'tls' | 'http_headers' | 'exposure' | 'cms' | 'auth' | 'injection' | 'cve' | 'config' | 'deps' | 'cert' | 'phishing' | 'leak';
export type ArtifactKind = 'screenshot' | 'file' | 'command_output' | 'pcap' | 'credential_dump' | 'note';
export type PlaybookRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WorkerRunStatus = 'pending' | 'provisioning' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export type WorkerProvider = 'local' | 'hetzner' | 'aws' | 'digitalocean' | 'docker_host' | 'tor_proxy';
export type RuleTrigger = 'entity.created' | 'entity.updated' | 'finding.created' | 'playbook_run.completed' | 'schedule';
export type RuleAction = 'start_playbook' | 'tag_entity' | 'notify_boss' | 'create_finding';

// ============================================================================
// BASE APP TYPES (schema.ts)
// ============================================================================

export type NodeSecuUser = {
  id: number;
  externalUserId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  /** direct-auth fields (null in williams-mode) */
  passwordHash: string | null;
  name: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export type UserInsert = {
  externalUserId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** direct-auth fields (null in williams-mode) */
  passwordHash?: string | null;
  name?: string | null;
  emailVerifiedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date | null;
};

export type NodeSecuUserId = number;

export type AuthRefreshToken = {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

export type AuthRefreshTokenInsert = {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedByTokenHash?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
};

export type AuthPushToken = {
  id: number;
  userId: number;
  token: string;
  platform: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthPushTokenInsert = {
  userId: number;
  token: string;
  platform: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthEmailVerificationToken = {
  id: number;
  userId: number;
  tokenHash: string;
  email: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type AuthEmailVerificationTokenInsert = {
  userId: number;
  tokenHash: string;
  email: string;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
};

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

export type NodeSecuUserActivity = {
  userId: number;
  activityDate: string;
  /** Date of activity (YYYY-MM-DD) */
  firstActivityAt: Date;
  /** First request of the day */
  lastActivityAt: Date;
  /** Last request of the day (updated continuously) */
  requestCount?: number;
  /** Total requests this day */
  requests?: any;
  /** Array of request details (max 50, FIFO) */
  createdAt: Date;
  /** When this daily record was created */
  updatedAt: Date;
};

export type NodeSecuUserActivityId = number;

export type AppSettings = {
  key: string;
  value: string;
  allowedValues?: string | null;
  /** Comma-separated list of allowed values (for enum-like settings) */
  type: AppSettingsType;
  description?: string | null;
  createdAt: Date;
};

export type AppSettingsInsert = {
  key: string;
  value: string;
  allowedValues?: string | null;
  /** Comma-separated list of allowed values (for enum-like settings) */
  type: AppSettingsType;
  description?: string | null;
  createdAt: Date;
};

export type AppSettingsId = number;

export type AppLog = {
  id: number;
  level: AppLogLevel;
  message: string;
  context: any;
  createdAt: Date;
};

export type AppLogId = number;

export type Webhook = {
  id: number;
  provider: string;
  /** z. B. "Stripe", "PayPal", "Printful" */
  eventType: string;
  externalId: string;
  payload: any;
  /** Raw payload as received from the provider */
  processed: boolean;
  status: WebhookStatus;
  processMessage: string | null;
  originUrl: string | null;
  createdAt: Date;
  processedAt: Date | null;
  userAgent: string | null;
  /** User-Agent Header */
  signature: string | null;
  /** Webhook signature für Verifizierung */
  retryCount: number;
  /** Anzahl der Retry-Versuche */
  lastRetryAt: Date | null;
};

export type WebhookId = number;

export type Permission = {
  id: number;
  name: string;
  description: string | null;
};

export type PermissionId = number;

export type Role = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  isSellable: boolean;
};

export type RoleId = number;

export type RolePermission = {
  id: number;
  roleId: number;
  permissionId: number;
  assignedBy: number;
  revokedBy: number | null;
  createdAt: Date;
  validTo: Date | null;
};

export type RolePermissionId = number;

export type RoleAssignment = {
  id: number;
  userId: number;
  status: RoleAssignmentStatus;
  roleId: number;
  validFrom: Date;
  validTo: Date | null;
  assignedBy: number;
  revokedBy: number | null;
  createdAt: Date;
};

export type RoleAssignmentId = number;

export type EntitlementSyncLink = {
  id: number;
  linkKey: string;
  externalUserId: string;
  externalIdentifier: string;
  entitlementType: EntitlementSyncType;
  userId: number | null;
  roleId: number | null;
  roleAssignmentId: number | null;
  shopSyncVersion: string | null;
  shopAssignmentId: string | null;
  shopEntitlementId: string | null;
  shopCustomerId: string | null;
  shopOrderId: string | null;
  shopOrderItemId: string | null;
  sourceAppId: string | null;
  sourceTargetAppId: string | null;
  sourceClientId: string | null;
  lastOperation: EntitlementSyncOperation | null;
  isActive: boolean;
  validFrom: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  context: any;
  createdAt: Date;
  updatedAt: Date | null;
  lastSeenAt: Date;
};

export type EntitlementSyncLinkId = number;

export type UsageOverageEvent = {
  id: number;
  externalEventId: string;
  sourceFingerprint: string;
  externalUserId: string;
  shopAssignmentId: string | null;
  externalIdentifier: string;
  entitlementType: EntitlementSyncType;
  metricKey: string;
  unit: string;
  periodStart: Date;
  periodEnd: Date;
  occurredAt: Date;
  includedQuantity: string;
  usedQuantity: string;
  overageQuantity: string;
  overageAmount: string;
  currency: string;
  note: string | null;
  pricingPayload: any;
  createdAt: Date;
  updatedAt: Date | null;
};

export type UsageOverageEventId = number;

export type ShopLimitConfig = {
  id: number;
  externalUserId: string;
  metricKey: string;
  includedQuantity: string;
  limitBehavior: string;
  payAsYouGoActive: boolean;
  maxOverageQuantity: string | null;
  overagePricePerUnit: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export type ShopLimitConfigInsert = {
  externalUserId: string;
  metricKey: string;
  includedQuantity?: string;
  limitBehavior?: string;
  payAsYouGoActive?: boolean;
  maxOverageQuantity?: string | null;
  overagePricePerUnit?: string | null;
  lastSyncedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date | null;
};

export type ShopCreditBalance = {
  id: number;
  externalUserId: string;
  metricKey: string;
  totalRemaining: string;
  localUsed: string;
  lastShopSync: Date | null;
  pools: any;
  createdAt: Date;
  updatedAt: Date | null;
};

export type ShopCreditBalanceInsert = {
  externalUserId: string;
  metricKey: string;
  totalRemaining?: string;
  localUsed?: string;
  lastShopSync?: Date | null;
  pools?: any;
  createdAt: Date;
  updatedAt?: Date | null;
};

export type CreditConsumptionQueueEntry = {
  id: number;
  externalUserId: string;
  metricKey: string;
  amount: string;
  idempotencyKey: string;
  status: CreditConsumptionStatus;
  attempts: number;
  shopResponse: any | null;
  lastAttemptAt: Date | null;
  createdAt: Date;
};

export type CreditConsumptionQueueInsert = {
  externalUserId: string;
  metricKey: string;
  amount: string;
  idempotencyKey: string;
  status?: CreditConsumptionStatus;
  attempts?: number;
  shopResponse?: any | null;
  lastAttemptAt?: Date | null;
  createdAt: Date;
};

export type WorkflowQueue = {
  id: string;
  /** String format: WF_<timestamp>_<hash> */
  workflowType: string;
  payload: any;
  status: WorkflowQueueStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  tasks: any;
  /** Array of tasks with expected duration */
  currentTask: number;
  /** Current task being processed */
  taskResults: any;
  /** Array of task results/details (logs go here, so we can see everything..) */
  createdAt: Date;
  scheduledAt: Date | null;
  updatedAt: Date | null;
  priority: number;
  /** Higher number = higher priority */
  userId: number | null;
  createdBy: WorkflowCreatedBy;
  /** Abort & Cleanup System */
  abortRequested: boolean;
  /** User requested abort */
  cleanupHandler: string | null;
  /** Cleanup function identifier */
  timeoutAt: Date | null;
};

export type WorkflowQueueId = string;

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


// ============================================================================
// APP PERMISSIONS
// ============================================================================

export enum NodeSecuAppPermissions {
  UsersManage = "users_manage",
  UsersView = "users_view",
  SettingsEdit = "settings_edit",
  PermissionsManage = "permissions_manage",
  PermissionsHistoryView = "permissions_history_view",
  RolesManage = "roles_manage",
  RolesHistoryView = "roles_history_view",
  WebhookView = "webhook_view",
  WebhookDelete = "webhook_delete",
  LogView = "log_view",
  LogDelete = "log_delete"
}

export type NodeSecuAppPermissionValue = (typeof NodeSecuAppPermissions)[keyof typeof NodeSecuAppPermissions];

// ============================================================================
// APP SETTINGS
// ============================================================================

// No settings defined



// ============================================================================
// SHARED UTILITY TYPES
// ============================================================================

export type Languages = "DE" | "EN";

export type Prettify<T> = {
  [K in keyof T]: T[K];
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

// ============================================================================
// FEATURE TYPES (individual schema)
// ============================================================================

export type Engagement = {
  id: number;
  name: string;
  slug: string;
  kind: EngagementKind;
  status: EngagementStatus;
  ownerUserId: number | null;
  scopeSummary: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  archivedAt: Date | null;
};

export type NewEngagement = {
  name: string;
  slug: string;
  kind: EngagementKind;
  status?: EngagementStatus;
  ownerUserId?: number | null;
  scopeSummary?: string | null;
  createdAt?: Date;
  updatedAt?: Date | null;
  archivedAt?: Date | null;
};

export type Entity = {
  id: number;
  kind: EntityKind;
  displayName: string;
  canonicalKey: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type NewEntity = {
  kind: EntityKind;
  displayName: string;
  canonicalKey: string;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
};

export type EntityRelationship = {
  id: number;
  fromEntityId: number;
  toEntityId: number;
  kind: string;
  data: any | null;
  firstObservedAt: Date;
  lastObservedAt: Date;
};

export type NewEntityRelationship = {
  fromEntityId: number;
  toEntityId: number;
  kind: string;
  data?: any | null;
  firstObservedAt?: Date;
  lastObservedAt?: Date;
};

export type RelationshipKind = | "employs" | "works_with" | "subsidiary_of" | "parent_of" | "supplies"
    | "customer_of" | "member_of" | "located_at"
    | "owns_credential" | "uses_credential"
    | "owns" | "operates"
    | "resolves_to" | "hosted_on" | "runs_on"
    | "uses_tech" | "linked_to"
    | string;

export type EntityTag = {
  id: number;
  entityId: number;
  tag: string;
  color: string | null;
  createdAt: Date;
};

export type NewEntityTag = {
  entityId: number;
  tag: string;
  color?: string | null;
  createdAt?: Date;
};

export type EngagementEntity = {
  id: number;
  engagementId: number;
  entityId: number;
  role: EngagementEntityRole;
  notes: string | null;
  addedAt: Date;
  addedBy: number | null;
};

export type NewEngagementEntity = {
  engagementId: number;
  entityId: number;
  role?: EngagementEntityRole;
  notes?: string | null;
  addedAt?: Date;
  addedBy?: number | null;
};

export type EntityAuthorization = {
  id: number;
  entityId: number;
  kind: AuthorizationKind;
  scope: AuthorizationScope;
  proofType: AuthorizationProofType;
  proofRef: string | null;
  verificationToken: string | null;
  grantedBy: number | null;
  grantedAt: Date;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: number | null;
  notes: string | null;
  createdAt: Date;
};

export type NewEntityAuthorization = {
  entityId: number;
  kind: AuthorizationKind;
  scope: AuthorizationScope;
  proofType?: AuthorizationProofType;
  proofRef?: string | null;
  verificationToken?: string | null;
  grantedBy?: number | null;
  grantedAt?: Date;
  verifiedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  revokedBy?: number | null;
  notes?: string | null;
  createdAt?: Date;
};

export type Finding = {
  id: number;
  engagementId: number;
  entityId: number | null;
  workerRunId: number | null;
  fingerprint: string;
  severity: Severity;
  category: FindingCategory;
  status: FindingStatus;
  title: string;
  description: string;
  rawData: any | null;
  recommendation: string | null;
  cveIds: any;
  cvssScore: string | null;
  discoveredAt: Date;
  resolvedAt: Date | null;
};

export type NewFinding = {
  engagementId: number;
  entityId?: number | null;
  workerRunId?: number | null;
  fingerprint: string;
  severity: Severity;
  category: FindingCategory;
  status?: FindingStatus;
  title: string;
  description: string;
  rawData?: any | null;
  recommendation?: string | null;
  cveIds?: any;
  cvssScore?: string | null;
  discoveredAt?: Date;
  resolvedAt?: Date | null;
};

export type Artifact = {
  id: number;
  engagementId: number;
  entityId: number | null;
  kind: ArtifactKind;
  title: string | null;
  body: string | null;
  storageRef: string | null;
  mime: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  redacted: boolean;
  capturedAt: Date;
  createdBy: number | null;
};

export type NewArtifact = {
  engagementId: number;
  entityId?: number | null;
  kind: ArtifactKind;
  title?: string | null;
  body?: string | null;
  storageRef?: string | null;
  mime?: string | null;
  sha256?: string | null;
  sizeBytes?: number | null;
  redacted?: boolean;
  capturedAt?: Date;
  createdBy?: number | null;
};

export type CommandHistoryEntry = {
  id: number;
  engagementId: number;
  entityId: number | null;
  workerRunId: number | null;
  rawCommand: string;
  exitCode: number | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type NewCommandHistoryEntry = {
  engagementId: number;
  entityId?: number | null;
  workerRunId?: number | null;
  rawCommand: string;
  exitCode?: number | null;
  startedAt?: Date;
  finishedAt?: Date | null;
};

export type PlaybookRun = {
  id: number;
  engagementId: number;
  playbookKey: string;
  status: PlaybookRunStatus;
  triggeredByUserId: number | null;
  params: any | null;
  resultSummary: any | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export type NewPlaybookRun = {
  engagementId: number;
  playbookKey: string;
  status?: PlaybookRunStatus;
  triggeredByUserId?: number | null;
  params?: any | null;
  resultSummary?: any | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt?: Date;
};

export type WorkerRun = {
  id: number;
  playbookRunId: number | null;
  engagementId: number;
  entityId: number | null;
  workerKey: string;
  status: WorkerRunStatus;
  provider: WorkerProvider;
  providerInstanceId: string | null;
  providerRegion: string | null;
  logsRef: string | null;
  exitCode: number | null;
  error: string | null;
  durationMs: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export type NewWorkerRun = {
  playbookRunId?: number | null;
  engagementId: number;
  entityId?: number | null;
  workerKey: string;
  status?: WorkerRunStatus;
  provider?: WorkerProvider;
  providerInstanceId?: string | null;
  providerRegion?: string | null;
  logsRef?: string | null;
  exitCode?: number | null;
  error?: string | null;
  durationMs?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt?: Date;
};

export type SecurityAuditLog = {
  id: number;
  actorUserId: number | null;
  actorIpHash: string | null;
  engagementId: number | null;
  action: string;
  targetType: string | null;
  targetId: number | null;
  payload: any;
  success: boolean;
  errorMessage: string | null;
  createdAt: Date;
};

export type NewSecurityAuditLog = {
  actorUserId?: number | null;
  actorIpHash?: string | null;
  engagementId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  payload?: any;
  success?: boolean;
  errorMessage?: string | null;
  createdAt?: Date;
};

export type Rule = {
  id: number;
  name: string;
  description: string | null;
  scope: string;
  trigger: RuleTrigger;
  action: RuleAction;
  enabled: boolean;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date | null;
  lastFiredAt: Date | null;
};

export type NewRule = {
  name: string;
  description?: string | null;
  scope?: string;
  trigger: RuleTrigger;
  action: RuleAction;
  enabled?: boolean;
  createdBy?: number | null;
  createdAt?: Date;
  updatedAt?: Date | null;
  lastFiredAt?: Date | null;
};

export type OsintProviderState = {
  id: number;
  providerKey: string;
  windowStart: Date;
  lastRequestAt: Date | null;
  last429At: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
};

export type NewOsintProviderState = {
  providerKey: string;
  windowStart?: Date;
  lastRequestAt?: Date | null;
  last429At?: Date | null;
  createdAt?: Date;
  updatedAt?: Date | null;
};

export type SignalChainLog = {
  id: number;
  engagementId: number;
  rootEntityId: number | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type NewSignalChainLog = {
  engagementId: number;
  rootEntityId?: number | null;
  startedAt?: Date;
  finishedAt?: Date | null;
};

export type EngagementGraph = {
    engagementId: number;
    nodes: Array<{
        data: {
            id: string;
            label: string;
            kind: EntityKind;
            entityId: number;
            role: EngagementEntityRole | null;
            tags: string[];
        };
    }>;
    edges: Array<{
        data: {
            id: string;
            source: string;
            target: string;
            kind: string;
            confidence: number;
        };
    }>;
};

export type EngagementWithGraph = Engagement & {
    graph: EngagementGraph;
    entityCount: number;
    findingCount: number;
};


// ============================================================================
// OAUTH2 TYPES
// ============================================================================





export type OAuth2Client = {
  id: number;
  /** Client identification */
  clientId: string;
  clientSecretHash: string;
  clientSecretFingerprint: string;
  /** HMAC-SHA256 */
  pepperVersion: number;
  /**
   * For secret rotation
   * Metadata
   */
  name: string;
  /** e.g., "Production API Client" */
  description: string | null;
  /**
   * e.g., "Main backend service for production"
   * Tenant isolation (only used when OAUTH2_TENANT_CONFIG.enabled = true)
   * Apps with tenants set the real ID; apps without get the default 0.
   * FK constraint is added by app-specific migration, NOT in Drizzle schema (keeps file syncable).
   */
  managingCompanyId: number;
  defaultCostCenter: number | null;
  /** Default cost center for operations */
  availableCostCenters: string | null;
  /**
   * JSON array of allowed cost center IDs (null = all)
   * Access control
   */
  role: string;
  /** viewer | editor | admin */
  scopes: string | null;
  /**
   * JSON array: ["invoices:read", "invoices:write", "expenses:read"]
   * Token settings
   */
  accessTokenTtl: number;
  /** Seconds (1 hour default) */
  refreshTokenTtl: number;
  /** Seconds (30 days default) */
  maxTokensPerClient: number;
  /**
   * Max concurrent refresh tokens
   * Security
   */
  allowedIps: string | null;
  /** JSON array of whitelisted IPs (null = any) */
  allowedOrigins: string | null;
  /** JSON array of whitelisted origins for CORS */
  rateLimitPerMinute: number;
  /** Requests per minute */
  rateLimitPerHour: number;
  /**
   * Requests per hour
   * Status
   */
  isActive: boolean;
  revokedAt: Date | null;
  validFrom: Date;
  validTo: Date | null;
  /**
   * null = no expiry
   * Audit
   */
  createdBy: number;
  /** User ID who created this client */
  createdAt: Date;
  updatedAt: Date | null;
  lastUsedAt: Date | null;
};

export type OAuth2ClientInsert = {
  /** Client identification */
  clientId: string;
  clientSecretHash: string;
  clientSecretFingerprint: string;
  /** HMAC-SHA256 */
  pepperVersion?: number;
  /**
   * For secret rotation
   * Metadata
   */
  name: string;
  /** e.g., "Production API Client" */
  description?: string | null;
  /**
   * e.g., "Main backend service for production"
   * Tenant isolation (only used when OAUTH2_TENANT_CONFIG.enabled = true)
   * Apps with tenants set the real ID; apps without get the default 0.
   * FK constraint is added by app-specific migration, NOT in Drizzle schema (keeps file syncable).
   */
  managingCompanyId?: number;
  defaultCostCenter?: number | null;
  /** Default cost center for operations */
  availableCostCenters?: string | null;
  /**
   * JSON array of allowed cost center IDs (null = all)
   * Access control
   */
  role?: string;
  /** viewer | editor | admin */
  scopes?: string | null;
  /**
   * JSON array: ["invoices:read", "invoices:write", "expenses:read"]
   * Token settings
   */
  accessTokenTtl?: number;
  /** Seconds (1 hour default) */
  refreshTokenTtl?: number;
  /** Seconds (30 days default) */
  maxTokensPerClient?: number;
  /**
   * Max concurrent refresh tokens
   * Security
   */
  allowedIps?: string | null;
  /** JSON array of whitelisted IPs (null = any) */
  allowedOrigins?: string | null;
  /** JSON array of whitelisted origins for CORS */
  rateLimitPerMinute?: number;
  /** Requests per minute */
  rateLimitPerHour?: number;
  /**
   * Requests per hour
   * Status
   */
  isActive?: boolean;
  revokedAt?: Date | null;
  validFrom?: Date;
  validTo?: Date | null;
  /**
   * null = no expiry
   * Audit
   */
  createdBy: number;
  /** User ID who created this client */
  createdAt?: Date;
  updatedAt?: Date | null;
  lastUsedAt?: Date | null;
};

export type OAuth2ClientId = OAuth2Client["id"];

export type OAuth2RefreshToken = {
  id: number;
  clientId: number;
  /** Token identification */
  tokenHash: string;
  /** Argon2 hash of refresh token */
  tokenFingerprint: string;
  /** HMAC-SHA256 for fast lookup */
  jti: string;
  /**
   * JWT ID (unique identifier)
   * Metadata
   */
  scope: string | null;
  /** Space-separated scopes granted to this token */
  issuedAt: Date;
  expiresAt: Date;
  /** Security */
  isRevoked: boolean;
  revokedAt: Date | null;
  revokedReason: string | null;
  /** Tracking */
  lastUsedAt: Date | null;
  usageCount: number;
  ipAddress: string | null;
  /** IPv4 or IPv6 */
  userAgent: string | null;
};

export type OAuth2RefreshTokenInsert = {
  clientId: number;
  /** Token identification */
  tokenHash: string;
  /** Argon2 hash of refresh token */
  tokenFingerprint: string;
  /** HMAC-SHA256 for fast lookup */
  jti: string;
  /**
   * JWT ID (unique identifier)
   * Metadata
   */
  scope?: string | null;
  /** Space-separated scopes granted to this token */
  issuedAt?: Date;
  expiresAt: Date;
  /** Security */
  isRevoked?: boolean;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  /** Tracking */
  lastUsedAt?: Date | null;
  usageCount?: number;
  ipAddress?: string | null;
  /** IPv4 or IPv6 */
  userAgent?: string | null;
};

export type OAuth2AuditLog = {
  id: number;
  clientId: number | null;
  /** Request details */
  grantType: string;
  /** client_credentials | refresh_token */
  scope: string | null;
  /** Requested scope */
  success: boolean;
  errorCode: string | null;
  /** invalid_client | invalid_grant | etc. */
  errorDescription: string | null;
  /** Security context */
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: Date;
  /** Rate limiting metadata */
  requestCount: number | null;
  /** Requests in current window */
  rateLimitExceeded: boolean;
};

export type OAuth2AuditLogInsert = {
  clientId?: number | null;
  /** Request details */
  grantType: string;
  /** client_credentials | refresh_token */
  scope?: string | null;
  /** Requested scope */
  success: boolean;
  errorCode?: string | null;
  /** invalid_client | invalid_grant | etc. */
  errorDescription?: string | null;
  /** Security context */
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp?: Date;
  /** Rate limiting metadata */
  requestCount?: number | null;
  /** Requests in current window */
  rateLimitExceeded?: boolean;
};

export type UnsensitiveOAuth2Client = Omit<OAuth2Client, "clientSecretHash" | "clientSecretFingerprint" | "pepperVersion">;



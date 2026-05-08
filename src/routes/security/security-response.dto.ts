import { z } from "zod";

const isoDate = z.string();
const nullableIsoDate = isoDate.nullable();
const jsonObject = z.record(z.unknown());

export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export const authorizationScopeSchema = z.enum(["passive_only", "active_safe", "active_intrusive"]);
export const authorizationKindSchema = z.enum(["own", "verified_ownership", "written_consent", "internal_lab"]);
export const authorizationProofTypeSchema = z.enum([
    "dns_txt",
    "http_file",
    "written_contract",
    "manual_owner_verification",
    "none",
]);
export const engagementKindSchema = z.enum(["solo_lab", "ctf", "bug_bounty", "customer_pentest", "internal"]);
export const engagementStatusSchema = z.enum(["planning", "active", "paused", "completed", "archived"]);
export const entityKindSchema = z.enum([
    "asset_domain",
    "asset_subdomain",
    "asset_ip",
    "asset_host",
    "asset_url",
    "person",
    "organization",
    "location",
    "credential_ref",
    "document",
    "email_address",
    "username",
    "phone_number",
    "social_account",
    "infrastructure_provider",
]);
export const engagementEntityRoleSchema = z.enum(["primary_target", "in_scope", "out_of_scope", "pivot", "context"]);
export const findingStatusSchema = z.enum(["open", "triaged", "confirmed", "false_positive", "wont_fix", "fixed"]);
export const findingTriageReasonSchema = z.enum([
    "irrelevant_legacy",
    "compensating_control",
    "accepted_risk",
    "duplicate",
    "manual_review_pending",
    "customer_approved",
    "scoping_excluded",
    "other",
]);
export const findingCategorySchema = z.enum([
    "dns",
    "email_security",
    "tls",
    "http_headers",
    "exposure",
    "cms",
    "auth",
    "injection",
    "cve",
    "config",
    "deps",
    "cert",
    "phishing",
    "leak",
    "compliance_imprint",
]);
export const playbookRunStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export const workerRunStatusSchema = z.enum([
    "pending",
    "provisioning",
    "running",
    "completed",
    "failed",
    "cancelled",
    "skipped",
]);
export const workerProviderSchema = z.enum([
    "local",
    "hetzner",
    "aws",
    "digitalocean",
    "docker_host",
    "tor_proxy",
]);
export const ruleTriggerSchema = z.enum([
    "entity.created",
    "entity.updated",
    "finding.created",
    "playbook_run.completed",
    "schedule",
]);
export const ruleActionSchema = z.enum(["start_playbook", "tag_entity", "notify_boss", "create_finding"]);
export const hintSlotSchema = z.enum([
    "owner_name",
    "owner_city",
    "owner_company",
    "owner_known_email",
    "owner_known_username",
    "owner_alt_domain",
    "industry",
    "free_text",
]);

export const okSchema = z.object({ ok: z.boolean() }).strict();
export const noDataSchema = z.null();
export const idSchema = z.object({ id: z.number().int().positive() }).strict();

export const engagementSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    kind: engagementKindSchema,
    status: engagementStatusSchema,
    ownerUserId: z.number().int().nullable(),
    scopeSummary: z.string().nullable(),
    osintBudgetPerHour: z.number().int(),
    osintMaxHops: z.number().int(),
    createdAt: isoDate,
    updatedAt: nullableIsoDate,
    archivedAt: nullableIsoDate,
}).strict();

export const entitySchema = z.object({
    id: z.number().int(),
    kind: entityKindSchema,
    displayName: z.string(),
    canonicalKey: z.string(),
    data: jsonObject,
    firstSeenAt: isoDate,
    lastSeenAt: isoDate,
}).strict();

export const engagementEntityLinkSchema = z.object({
    id: z.number().int(),
    role: engagementEntityRoleSchema,
    notes: z.string().nullable(),
}).strict();

export const engagementEntityListItemSchema = z.object({
    link: engagementEntityLinkSchema,
    entity: entitySchema,
}).strict();

export const entityRelationshipSchema = z.object({
    id: z.number().int(),
    fromEntityId: z.number().int(),
    toEntityId: z.number().int(),
    kind: z.string(),
    data: jsonObject,
    confidence: z.number().int(),
    source: z.string(),
    firstObservedAt: isoDate,
    lastObservedAt: isoDate,
}).strict();

export const entityRelationshipWithEntitiesSchema = entityRelationshipSchema.extend({
    fromEntity: entitySchema.optional(),
    toEntity: entitySchema.optional(),
});

export const engagementGraphSchema = z.object({
    engagementId: z.number().int(),
    nodes: z.array(z.object({
        data: z.object({
            id: z.string(),
            label: z.string(),
            kind: entityKindSchema,
            entityId: z.number().int(),
            role: engagementEntityRoleSchema.nullable(),
            tags: z.array(z.string()),
        }).strict(),
    }).strict()),
    edges: z.array(z.object({
        data: z.object({
            id: z.string(),
            source: z.string(),
            target: z.string(),
            kind: z.string(),
            confidence: z.number().int(),
        }).strict(),
    }).strict()),
}).strict();

export const engagementWithGraphSchema = engagementSchema.extend({
    graph: engagementGraphSchema,
    entityCount: z.number().int(),
    findingCount: z.number().int(),
});

export const engagementCreateResponseSchema = z.object({
    engagement: engagementSchema,
    primaryEntity: entitySchema.optional(),
}).strict();

export const engagementEntityLinkResponseSchema = z.object({
    id: z.number().int(),
    created: z.boolean(),
    entityId: z.number().int(),
}).strict();

export const entitySearchItemSchema = entitySchema.extend({
    engagementCount: z.number().int(),
    tags: z.array(z.string()),
});

export const entityDetailSchema = entitySchema.extend({
    tags: z.array(z.string()),
    engagements: z.array(z.object({
        engagementId: z.number().int(),
        role: z.string().nullable(),
        notes: z.string().nullable(),
    }).strict()),
    relationshipCount: z.number().int(),
});

export const tagResponseSchema = z.object({ tag: z.string() }).strict();

export const authorizationSchema = z.object({
    id: z.number().int(),
    entityId: z.number().int(),
    kind: authorizationKindSchema,
    scope: authorizationScopeSchema,
    proofType: authorizationProofTypeSchema,
    proofRef: z.string().nullable(),
    verificationToken: z.string().nullable(),
    grantedBy: z.number().int().nullable(),
    grantedAt: isoDate,
    verifiedAt: nullableIsoDate,
    expiresAt: nullableIsoDate,
    revokedAt: nullableIsoDate,
    revokedBy: z.number().int().nullable(),
    notes: z.string().nullable(),
    createdAt: isoDate,
}).strict();

export const authorizationWithEntitySchema = authorizationSchema.extend({
    entity: entitySchema.nullable(),
    decision: z.object({
        activeSafeAllowed: z.boolean(),
        activeSafeReason: z.string(),
        activeIntrusiveAllowed: z.boolean(),
        activeIntrusiveReason: z.string(),
    }).strict(),
});

export const grantAuthorizationResponseSchema = z.object({
    authorizationId: z.number().int(),
    engagementEntityId: z.number().int(),
}).strict();

export const revokeAuthorizationResponseSchema = z.object({
    authorizationId: z.number().int(),
    revokedAt: isoDate,
}).strict();

export const findingSchema = z.object({
    id: z.number().int(),
    engagementId: z.number().int(),
    entityId: z.number().int().nullable(),
    workerRunId: z.number().int().nullable(),
    fingerprint: z.string(),
    severity: severitySchema,
    category: findingCategorySchema,
    status: findingStatusSchema,
    title: z.string(),
    description: z.string(),
    rawData: jsonObject,
    recommendation: z.string().nullable(),
    cveIds: z.array(z.string()),
    cvssScore: z.string().nullable(),
    triageReason: findingTriageReasonSchema.nullable(),
    triageNote: z.string().nullable(),
    resolutionNote: z.string().nullable(),
    resolvedAt: nullableIsoDate,
    resolvedBy: z.number().int().nullable(),
    discoveredAt: isoDate,
}).strict();

export const findingCommentSchema = z.object({
    id: z.number().int(),
    findingId: z.number().int(),
    userId: z.number().int().nullable(),
    body: z.string(),
    createdAt: isoDate,
    updatedAt: nullableIsoDate,
}).strict();

export const findingCommentWithAuthorSchema = findingCommentSchema.extend({
    author: z.object({
        id: z.number().int(),
        email: z.string().nullable(),
        firstname: z.string().nullable(),
        lastname: z.string().nullable(),
    }).nullable(),
});

export const findingWithContextSchema = findingSchema.extend({
    entity: entitySchema.nullable(),
    workerRun: z.object({
        id: z.number().int(),
        workerKey: z.string(),
        status: workerRunStatusSchema,
    }).nullable(),
});

export const findingPatchResponseSchema = z.object({
    finding: findingSchema,
}).strict();

export const playbookRunSchema = z.object({
    id: z.number().int(),
    engagementId: z.number().int(),
    playbookKey: z.string(),
    status: playbookRunStatusSchema,
    triggeredBy: z.string(),
    triggeredByUserId: z.number().int().nullable(),
    params: jsonObject,
    resultSummary: jsonObject,
    startedAt: nullableIsoDate,
    finishedAt: nullableIsoDate,
    createdAt: isoDate,
    hopDepth: z.number().int(),
    parentRunId: z.number().int().nullable(),
}).strict();

export const workerRunSchema = z.object({
    id: z.number().int(),
    playbookRunId: z.number().int().nullable(),
    engagementId: z.number().int(),
    entityId: z.number().int().nullable(),
    workerKey: z.string(),
    status: workerRunStatusSchema,
    provider: workerProviderSchema,
    providerInstanceId: z.string().nullable(),
    providerRegion: z.string().nullable(),
    logsRef: z.string().nullable(),
    exitCode: z.number().int().nullable(),
    error: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    startedAt: nullableIsoDate,
    finishedAt: nullableIsoDate,
    createdAt: isoDate,
}).strict();

export const playbookStepRunSchema = z.object({
    targetEntityId: z.number().int(),
    targetValue: z.string(),
    status: workerRunStatusSchema,
    findingsCreated: z.number().int(),
    findingsDeduped: z.number().int().optional(),
    techDiscovered: z.number().int(),
    discoveredEntities: z.number().int(),
    error: z.string().optional(),
    workerRunId: z.number().int().optional(),
}).strict();

export const playbookStepOutputSchema = z.object({
    stepKey: z.string(),
    workerKey: z.string(),
    runs: z.array(playbookStepRunSchema),
}).strict();

export const playbookRunSummarySchema = z.object({
    playbookKey: z.string(),
    rootEntityId: z.number().int(),
    steps: z.array(playbookStepOutputSchema),
    totalFindingsCreated: z.number().int(),
    totalFindingsDeduped: z.number().int(),
    totalDiscoveredEntities: z.number().int(),
    totalWorkerRuns: z.number().int().optional(),
    successfulWorkerRuns: z.number().int().optional(),
}).strict();

export const playbookRunStatusReportSchema = z.object({
    run: playbookRunSchema,
    workerRuns: z.array(workerRunSchema),
    summary: playbookRunSummarySchema.nullable(),
}).strict();

export const playbookRunLeanStatusSchema = z.object({
    runId: z.number().int(),
    engagementId: z.number().int(),
    playbookKey: z.string(),
    status: playbookRunStatusSchema,
    startedAt: nullableIsoDate,
    finishedAt: nullableIsoDate,
    createdAt: isoDate,
    workerRuns: z.object({
        total: z.number().int(),
        pending: z.number().int(),
        provisioning: z.number().int(),
        running: z.number().int(),
        completed: z.number().int(),
        failed: z.number().int(),
        cancelled: z.number().int(),
        skipped: z.number().int(),
    }).strict(),
    findingsCreated: z.number().int(),
    findingsDeduped: z.number().int(),
    discoveredEntities: z.number().int(),
    etag: z.string(),
}).strict();

export const playbookStartResponseSchema = z.object({
    runId: z.number().int(),
    status: playbookRunStatusSchema,
    playbook: z.object({
        key: z.string(),
        label: z.string(),
    }).strict(),
}).strict();

export const playbookBlockedResponseSchema = z.object({
    blocked: z.literal(true),
    reason: z.literal("hop_budget_exceeded"),
    hopDepthRequested: z.number().int(),
    hopDepthLimit: z.number().int(),
    parentRunId: z.number().int(),
}).strict();

export const playbookRegistryItemSchema = z.object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    acceptsRootEntityKinds: z.array(entityKindSchema),
    maxRequiredScope: authorizationScopeSchema,
    steps: z.array(z.object({
        key: z.string(),
        label: z.string(),
        workerKey: z.string(),
        dependsOn: z.array(z.string()),
        hasCondition: z.boolean(),
    }).strict()),
}).strict();

export const workerRegistryItemSchema = z.object({
    jobKey: z.string(),
    requiredScope: authorizationScopeSchema,
    description: z.string(),
    defaultTimeoutMs: z.number().int(),
}).strict();

export const workerRunExecutionResponseSchema = z.object({
    workerRunId: z.number().int(),
    status: workerRunStatusSchema,
    findingsCreated: z.number().int(),
    findingsDeduped: z.number().int(),
    techCount: z.number().int(),
    newDiscoveredEntities: z.number().int(),
    discoveredEntityIds: z.array(z.number().int()),
    durationMs: z.number().int(),
    exitCode: z.number().int().nullable().optional(),
    error: z.string().nullable().optional(),
}).passthrough();

export const ruleSchema = z.object({
    id: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    scope: z.string(),
    trigger: ruleTriggerSchema,
    action: ruleActionSchema,
    condition: jsonObject.nullable(),
    actionParams: jsonObject,
    enabled: z.boolean(),
    createdBy: z.number().int().nullable(),
    createdAt: isoDate,
    updatedAt: nullableIsoDate,
    fireCount: z.number().int(),
    lastFiredAt: nullableIsoDate,
}).strict();

export const hintSchema = z.object({
    id: z.number().int(),
    engagementId: z.number().int(),
    slot: hintSlotSchema,
    value: z.string(),
    source: z.string().nullable(),
    notes: z.string().nullable(),
    createdBy: z.number().int().nullable(),
    createdAt: isoDate,
    updatedAt: nullableIsoDate,
}).strict();

export const osintEmailLinkResponseSchema = z.object({
    entity: entitySchema,
    engagementEntityId: z.number().int(),
    relationshipId: z.number().int().nullable(),
}).strict();

export const signalChainLogSchema = z.object({
    id: z.number().int(),
    engagementId: z.number().int(),
    rootEntityId: z.number().int().nullable(),
    triggeredBy: z.string(),
    signalChain: z.array(jsonObject),
    startedAt: isoDate,
    finishedAt: nullableIsoDate,
}).strict();

export const enrichFullResponseSchema = z.object({
    signalChainLogId: z.number().int(),
    subPlaybookRuns: z.array(z.object({
        identityEntityId: z.number().int(),
        playbookKey: z.string(),
        runId: z.number().int(),
    }).strict()),
}).passthrough();

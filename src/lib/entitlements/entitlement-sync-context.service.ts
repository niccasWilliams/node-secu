import { database } from "@/db";
import {
  entitlementSyncLinks,
  EntitlementSyncLink,
  EntitlementSyncOperation,
  EntitlementSyncType,
} from "@/db/schema";
import { UserId } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { nowInBerlin } from "@/util/utils";

export type ShopEntitlementSyncContext = {
  shopSyncVersion?: string | null;
  shopAssignmentId?: string | null;
  shopEntitlementId?: string | null;
  shopCustomerId?: string | null;
  shopOrderId?: string | null;
  shopOrderItemId?: string | null;
  sourceAppId?: string | null;
  sourceTargetAppId?: string | null;
};

export type UpsertEntitlementSyncContextInput = {
  externalUserId: string;
  externalIdentifier: string;
  entitlementType: EntitlementSyncType;
  operation: EntitlementSyncOperation;
  userId?: UserId | null;
  roleId?: number | null;
  roleAssignmentId?: number | null;
  validFrom?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  isActive?: boolean;
  sourceClientId?: string | null;
  shopContext?: ShopEntitlementSyncContext;
  contextPayload?: Record<string, unknown> | null;
};

function normalize(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildLinkKey(input: {
  externalUserId: string;
  externalIdentifier: string;
  entitlementType: EntitlementSyncType;
  shopAssignmentId?: string | null;
}): string {
  const shopAssignmentId = normalize(input.shopAssignmentId);
  if (shopAssignmentId) return `shop:${shopAssignmentId}`;

  const user = normalize(input.externalUserId) ?? "unknown_user";
  const identifier = normalize(input.externalIdentifier) ?? "unknown_identifier";
  return `legacy:${user}:${input.entitlementType}:${identifier}`;
}

class EntitlementSyncContextService {
  async upsertContext(input: UpsertEntitlementSyncContextInput, trx = database): Promise<EntitlementSyncLink> {
    const now = nowInBerlin();
    const shopContext = input.shopContext ?? {};
    const normalizedShopAssignmentId = normalize(shopContext.shopAssignmentId);
    let linkKey = buildLinkKey({
      externalUserId: input.externalUserId,
      externalIdentifier: input.externalIdentifier,
      entitlementType: input.entitlementType,
      shopAssignmentId: normalizedShopAssignmentId,
    });

    // Prefer stable linkage to avoid duplicate rows when some calls miss context headers.
    // Priority:
    // 1) existing row by shopAssignmentId
    // 2) existing row by external tuple
    if (normalizedShopAssignmentId) {
      const existingByShopAssignment = await this.getByShopAssignmentId(normalizedShopAssignmentId, trx);
      if (existingByShopAssignment?.linkKey) {
        linkKey = existingByShopAssignment.linkKey;
      } else {
        const existingByTuple = await this.getLatestByExternalTuple(
          input.externalUserId,
          input.externalIdentifier,
          input.entitlementType,
          trx
        );
        if (existingByTuple?.linkKey) linkKey = existingByTuple.linkKey;
      }
    } else {
      const existingByTuple = await this.getLatestByExternalTuple(
        input.externalUserId,
        input.externalIdentifier,
        input.entitlementType,
        trx
      );
      if (existingByTuple?.linkKey) linkKey = existingByTuple.linkKey;
    }

    const contextJson = {
      ...(input.contextPayload ?? {}),
      source: {
        appId: normalize(shopContext.sourceAppId),
        targetAppId: normalize(shopContext.sourceTargetAppId),
        clientId: normalize(input.sourceClientId),
      },
      shop: {
        syncVersion: normalize(shopContext.shopSyncVersion),
        assignmentId: normalize(shopContext.shopAssignmentId),
        entitlementId: normalize(shopContext.shopEntitlementId),
        customerId: normalize(shopContext.shopCustomerId),
        orderId: normalize(shopContext.shopOrderId),
        orderItemId: normalize(shopContext.shopOrderItemId),
      },
      seenAt: now.toISOString(),
    };

    const [row] = await trx
      .insert(entitlementSyncLinks)
      .values({
        linkKey,
        externalUserId: input.externalUserId,
        externalIdentifier: input.externalIdentifier,
        entitlementType: input.entitlementType,
        userId: input.userId ?? null,
        roleId: input.roleId ?? null,
        roleAssignmentId: input.roleAssignmentId ?? null,
        shopSyncVersion: normalize(shopContext.shopSyncVersion),
        shopAssignmentId: normalizedShopAssignmentId,
        shopEntitlementId: normalize(shopContext.shopEntitlementId),
        shopCustomerId: normalize(shopContext.shopCustomerId),
        shopOrderId: normalize(shopContext.shopOrderId),
        shopOrderItemId: normalize(shopContext.shopOrderItemId),
        sourceAppId: normalize(shopContext.sourceAppId),
        sourceTargetAppId: normalize(shopContext.sourceTargetAppId),
        sourceClientId: normalize(input.sourceClientId),
        lastOperation: input.operation,
        isActive: input.isActive ?? true,
        validFrom: input.validFrom ?? null,
        expiresAt: input.expiresAt ?? null,
        revokedAt: input.revokedAt ?? null,
        context: contextJson,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: entitlementSyncLinks.linkKey,
        set: {
          externalUserId: input.externalUserId,
          externalIdentifier: input.externalIdentifier,
          entitlementType: input.entitlementType,
          userId: input.userId ?? null,
          roleId: input.roleId ?? null,
          roleAssignmentId: input.roleAssignmentId ?? null,
          shopSyncVersion: normalize(shopContext.shopSyncVersion),
          shopAssignmentId: normalizedShopAssignmentId,
          shopEntitlementId: normalize(shopContext.shopEntitlementId),
          shopCustomerId: normalize(shopContext.shopCustomerId),
          shopOrderId: normalize(shopContext.shopOrderId),
          shopOrderItemId: normalize(shopContext.shopOrderItemId),
          sourceAppId: normalize(shopContext.sourceAppId),
          sourceTargetAppId: normalize(shopContext.sourceTargetAppId),
          sourceClientId: normalize(input.sourceClientId),
          lastOperation: input.operation,
          isActive: input.isActive ?? true,
          validFrom: input.validFrom ?? null,
          expiresAt: input.expiresAt ?? null,
          revokedAt: input.revokedAt ?? null,
          context: sql`${entitlementSyncLinks.context} || ${JSON.stringify(contextJson)}::jsonb`,
          updatedAt: now,
          lastSeenAt: now,
        },
      })
      .returning();

    return row;
  }

  async getByShopAssignmentId(shopAssignmentId: string, trx = database): Promise<EntitlementSyncLink | null> {
    const normalized = normalize(shopAssignmentId);
    if (!normalized) return null;

    const [row] = await trx
      .select()
      .from(entitlementSyncLinks)
      .where(eq(entitlementSyncLinks.shopAssignmentId, normalized))
      .orderBy(desc(entitlementSyncLinks.updatedAt), desc(entitlementSyncLinks.id))
      .limit(1);

    return row ?? null;
  }

  async getLatestByExternalTuple(
    externalUserId: string,
    externalIdentifier: string,
    entitlementType: EntitlementSyncType,
    trx = database
  ): Promise<EntitlementSyncLink | null> {
    const [row] = await trx
      .select()
      .from(entitlementSyncLinks)
      .where(
        and(
          eq(entitlementSyncLinks.externalUserId, externalUserId),
          eq(entitlementSyncLinks.externalIdentifier, externalIdentifier),
          eq(entitlementSyncLinks.entitlementType, entitlementType)
        )
      )
      .orderBy(desc(entitlementSyncLinks.updatedAt), desc(entitlementSyncLinks.id))
      .limit(1);

    return row ?? null;
  }
}

export const entitlementSyncContextService = new EntitlementSyncContextService();

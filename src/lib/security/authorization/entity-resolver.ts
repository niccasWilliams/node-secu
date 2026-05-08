// Phase-1 AuthorizationResolver — liest Owner-Info & Auth-Records aus den
// neuen `secu_entities` / `secu_entity_authorizations`-Tabellen.
//
// Wird beim App-Bootstrap via `setAuthorizationResolver(entityAuthorizationResolver)`
// aktiviert. Solange das nicht passiert, läuft der Phase-0-NullResolver — passive
// geht durch, aktiv wird klar geblockt.

import { and, eq, gt, isNull, or } from "drizzle-orm";
import { database } from "@/db";
import {
    engagementEntities,
    engagements,
    entities,
    entityAuthorizations,
} from "@/db/individual/individual-schema";
import type {
    AuthorizationResolver,
    AuthRecord,
    OwnerInfo,
    ScanTargetRef,
} from "./authorization.types";

function parseEntityId(ref: ScanTargetRef): number | null {
    if (ref.kind !== "entity") return null;
    const id = typeof ref.id === "number" ? ref.id : Number.parseInt(String(ref.id), 10);
    return Number.isFinite(id) ? id : null;
}

export const entityAuthorizationResolver: AuthorizationResolver = {
    async resolveOwner(ref: ScanTargetRef): Promise<OwnerInfo | null> {
        const entityId = parseEntityId(ref);
        if (entityId == null) return null;

        const [row] = await database.select({ entityId: entities.id }).from(entities).where(eq(entities.id, entityId)).limit(1);
        if (!row) return null;

        // Internal-Lab: Entity ist über mind. 1 Engagement vom Typ `solo_lab` oder `internal` verknüpft.
        const labLinks = await database
            .select({ kind: engagements.kind, ownerUserId: engagements.ownerUserId })
            .from(engagementEntities)
            .innerJoin(engagements, eq(engagementEntities.engagementId, engagements.id))
            .where(eq(engagementEntities.entityId, entityId));

        const internalKinds = new Set(["solo_lab", "internal"]);
        const isInternalLab = labLinks.some((l) => internalKinds.has(l.kind));
        const ownerFromEngagement = labLinks.map((l) => l.ownerUserId).find((id): id is number => id != null) ?? null;

        return {
            ownerUserId: ownerFromEngagement,
            isOwnInfrastructure: false,
            isInternalLab,
        };
    },

    async getAuthorizations(ref: ScanTargetRef): Promise<AuthRecord[]> {
        const entityId = parseEntityId(ref);
        if (entityId == null) return [];

        const now = new Date();
        const rows = await database
            .select()
            .from(entityAuthorizations)
            .where(
                and(
                    eq(entityAuthorizations.entityId, entityId),
                    isNull(entityAuthorizations.revokedAt),
                    or(isNull(entityAuthorizations.expiresAt), gt(entityAuthorizations.expiresAt, now)),
                ),
            );

        return rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            scope: r.scope,
            verifiedAt: r.verifiedAt,
            expiresAt: r.expiresAt,
            revokedAt: r.revokedAt,
        }));
    },
};

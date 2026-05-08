// Engagement-Service — operative Wurzel jedes Pentest-Workflows.
//
// Phase 1: CRUD + Convenience-Endpoint (POST /engagements mit primaryDomain).
// Findings/Playbooks/Workers binden ab Phase 2 hier an.

import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { database } from "@/db";
import {
    artifacts,
    engagementEntities,
    engagements,
    entityAuthorizations,
    type Engagement,
    type EngagementEntityRole,
    type EngagementKind,
    type EngagementStatus,
    type Entity,
    type AuthorizationKind,
    type AuthorizationScope,
    type AuthorizationProofType,
} from "@/db/individual/individual-schema";
import { entityService } from "../entities/entity.service";

function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96) || `engagement-${Date.now()}`;
}

async function ensureUniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 1;
    while (true) {
        const [hit] = await database
            .select({ id: engagements.id })
            .from(engagements)
            .where(eq(engagements.slug, candidate))
            .limit(1);
        if (!hit) return candidate;
        suffix += 1;
        candidate = `${base}-${suffix}`;
    }
}

export type CreateEngagementInput = {
    name: string;
    kind: EngagementKind;
    ownerUserId?: number | null;
    status?: EngagementStatus;
    scopeSummary?: string | null;
    /** Convenience: legt zusätzlich eine `asset_domain`-Entity + Verknüpfung + Auth-Record an. */
    primaryDomain?: string | null;
};

export type UpdateEngagementInput = {
    name?: string;
    status?: EngagementStatus;
    scopeSummary?: string | null;
};

export type LinkEntityInput = {
    engagementId: number;
    entityId: number;
    role?: EngagementEntityRole;
    notes?: string | null;
    addedBy?: number | null;
};

export type GrantAuthorizationInput = {
    entityId: number;
    kind: AuthorizationKind;
    scope: AuthorizationScope;
    proofType?: AuthorizationProofType;
    proofRef?: string | null;
    verificationToken?: string | null;
    verifiedAt?: Date | null;
    expiresAt?: Date | null;
    grantedBy?: number | null;
    notes?: string | null;
};

export const engagementService = {
    async create(input: CreateEngagementInput): Promise<Engagement> {
        const slug = await ensureUniqueSlug(slugify(input.name));
        const [created] = await database
            .insert(engagements)
            .values({
                name: input.name.trim(),
                slug,
                kind: input.kind,
                status: input.status ?? "active",
                ownerUserId: input.ownerUserId ?? null,
                scopeSummary: input.scopeSummary ?? null,
            })
            .returning();
        return created;
    },

    async createWithPrimaryDomain(
        input: CreateEngagementInput & { primaryDomain: string },
    ): Promise<{ engagement: Engagement; entity: Entity }> {
        return database.transaction(async (_trx) => {
            const engagement = await this.create(input);

            const entity = await entityService.upsert({
                kind: "asset_domain",
                displayName: input.primaryDomain,
                canonical: { kind: "asset_domain", primaryValue: input.primaryDomain },
            });

            await this.linkEntity({
                engagementId: engagement.id,
                entityId: entity.id,
                role: "primary_target",
                addedBy: input.ownerUserId ?? null,
            });

            // Solo-Lab / Internal automatisch mit internal_lab-Authorization auf der Domain ausstatten.
            if (input.kind === "solo_lab" || input.kind === "internal") {
                await this.grantAuthorization({
                    entityId: entity.id,
                    kind: "internal_lab",
                    scope: "active_intrusive",
                    proofType: "manual_owner_verification",
                    verifiedAt: new Date(),
                    grantedBy: input.ownerUserId ?? null,
                    notes: `Auto-granted via convenience endpoint for ${input.kind}`,
                });
            }

            return { engagement, entity };
        });
    },

    async list(opts?: {
        includeArchived?: boolean;
        kind?: EngagementKind;
        ownerUserId?: number;
    }): Promise<Engagement[]> {
        const conditions: SQL[] = [];
        if (!opts?.includeArchived) conditions.push(isNull(engagements.archivedAt));
        if (opts?.kind) conditions.push(eq(engagements.kind, opts.kind));
        if (opts?.ownerUserId != null) conditions.push(eq(engagements.ownerUserId, opts.ownerUserId));

        return database
            .select()
            .from(engagements)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(engagements.createdAt));
    },

    async getById(id: number): Promise<Engagement | null> {
        const [row] = await database.select().from(engagements).where(eq(engagements.id, id)).limit(1);
        return row ?? null;
    },

    async getBySlug(slug: string): Promise<Engagement | null> {
        const [row] = await database.select().from(engagements).where(eq(engagements.slug, slug)).limit(1);
        return row ?? null;
    },

    async update(id: number, input: UpdateEngagementInput): Promise<Engagement | null> {
        const patch: Partial<typeof engagements.$inferInsert> = { updatedAt: new Date() };
        if (input.name != null) patch.name = input.name.trim();
        if (input.status != null) patch.status = input.status;
        if (input.scopeSummary !== undefined) patch.scopeSummary = input.scopeSummary;

        const [updated] = await database
            .update(engagements)
            .set(patch)
            .where(eq(engagements.id, id))
            .returning();
        return updated ?? null;
    },

    /** Soft-delete: setzt archivedAt + status='archived'. */
    async archive(id: number): Promise<Engagement | null> {
        const [updated] = await database
            .update(engagements)
            .set({ archivedAt: new Date(), status: "archived", updatedAt: new Date() })
            .where(eq(engagements.id, id))
            .returning();
        return updated ?? null;
    },

    // ─── Engagement ↔ Entity ────────────────────────────────────────────

    async linkEntity(input: LinkEntityInput): Promise<{ id: number; created: boolean }> {
        const existing = await database
            .select({ id: engagementEntities.id })
            .from(engagementEntities)
            .where(
                and(
                    eq(engagementEntities.engagementId, input.engagementId),
                    eq(engagementEntities.entityId, input.entityId),
                ),
            )
            .limit(1);

        if (existing.length > 0) {
            const patch: Partial<typeof engagementEntities.$inferInsert> = {};
            if (input.role) patch.role = input.role;
            if (input.notes !== undefined) patch.notes = input.notes;
            if (Object.keys(patch).length > 0) {
                await database
                    .update(engagementEntities)
                    .set(patch)
                    .where(eq(engagementEntities.id, existing[0].id));
            }
            return { id: existing[0].id, created: false };
        }

        const [row] = await database
            .insert(engagementEntities)
            .values({
                engagementId: input.engagementId,
                entityId: input.entityId,
                role: input.role ?? "in_scope",
                notes: input.notes ?? null,
                addedBy: input.addedBy ?? null,
            })
            .returning({ id: engagementEntities.id });
        return { id: row.id, created: true };
    },

    async unlinkEntity(engagementId: number, entityId: number): Promise<void> {
        await database
            .delete(engagementEntities)
            .where(
                and(
                    eq(engagementEntities.engagementId, engagementId),
                    eq(engagementEntities.entityId, entityId),
                ),
            );
    },

    async listEntitiesForEngagement(
        engagementId: number,
        filters?: { kind?: string },
    ): Promise<Array<{ link: { id: number; role: EngagementEntityRole; notes: string | null }; entity: Entity }>> {
        const links = await database
            .select()
            .from(engagementEntities)
            .where(eq(engagementEntities.engagementId, engagementId));
        if (links.length === 0) return [];

        const entityIds = links.map((l) => l.entityId);
        const { entities } = await import("@/db/individual/individual-schema");
        const ents = await database.select().from(entities).where(inArray(entities.id, entityIds));
        const map = new Map(ents.map((e) => [e.id, e]));

        return links
            .map((l) => {
                const entity = map.get(l.entityId);
                if (!entity) return null;
                if (filters?.kind && entity.kind !== filters.kind) return null;
                return {
                    link: { id: l.id, role: l.role, notes: l.notes },
                    entity,
                };
            })
            .filter((v): v is NonNullable<typeof v> => v != null);
    },

    // ─── Authorization am Entity ────────────────────────────────────────

    async grantAuthorization(input: GrantAuthorizationInput): Promise<number> {
        const [row] = await database
            .insert(entityAuthorizations)
            .values({
                entityId: input.entityId,
                kind: input.kind,
                scope: input.scope,
                proofType: input.proofType ?? "none",
                proofRef: input.proofRef ?? null,
                verificationToken: input.verificationToken ?? null,
                verifiedAt: input.verifiedAt ?? null,
                expiresAt: input.expiresAt ?? null,
                grantedBy: input.grantedBy ?? null,
                notes: input.notes ?? null,
            })
            .returning({ id: entityAuthorizations.id });
        return row.id;
    },

    async revokeAuthorization(authId: number, revokedBy?: number | null): Promise<void> {
        await database
            .update(entityAuthorizations)
            .set({ revokedAt: new Date(), revokedBy: revokedBy ?? null })
            .where(eq(entityAuthorizations.id, authId));
    },

    async listAuthorizationsForEntity(entityId: number) {
        return database
            .select()
            .from(entityAuthorizations)
            .where(eq(entityAuthorizations.entityId, entityId))
            .orderBy(desc(entityAuthorizations.createdAt));
    },

    // ─── Notes (Convenience) ────────────────────────────────────────────

    async addNote(input: {
        engagementId: number;
        body: string;
        title?: string | null;
        entityId?: number | null;
        createdBy?: number | null;
    }): Promise<number> {
        const [row] = await database
            .insert(artifacts)
            .values({
                engagementId: input.engagementId,
                entityId: input.entityId ?? null,
                kind: "note",
                title: input.title ?? null,
                body: input.body,
                createdBy: input.createdBy ?? null,
            })
            .returning({ id: artifacts.id });
        return row.id;
    },

    // ─── Counts (für getById-Detailshape) ───────────────────────────────

    async getCounts(engagementId: number): Promise<{ entityCount: number; findingCount: number }> {
        const { findings } = await import("@/db/individual/individual-schema");
        const [eRow] = await database
            .select({ cnt: sql<number>`cast(count(*) as int)` })
            .from(engagementEntities)
            .where(eq(engagementEntities.engagementId, engagementId));
        const [fRow] = await database
            .select({ cnt: sql<number>`cast(count(*) as int)` })
            .from(findings)
            .where(eq(findings.engagementId, engagementId));
        return { entityCount: eRow?.cnt ?? 0, findingCount: fRow?.cnt ?? 0 };
    },
};


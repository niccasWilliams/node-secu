// Engagement-Service — operative Wurzel jedes Pentest-Workflows.
//
// Phase 1: CRUD + Convenience-Endpoint (POST /engagements mit primaryDomain).
// Findings/Playbooks/Workers binden ab Phase 2 hier an.

import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { database } from "@/db";
import { users } from "@/db/schema";
import {
    artifacts,
    engagementEntities,
    engagements,
    entities,
    entityAuthorizations,
    findings,
    type Artifact,
    type Engagement,
    type EngagementEntityRole,
    type EngagementKind,
    type EngagementStatus,
    type Entity,
    type EntityKind,
    type AuthorizationKind,
    type AuthorizationScope,
    type AuthorizationProofType,
    type AuthorizationScope as AuthorizationScopeType,
    type EntityAuthorization,
    type SecuEngagementScope,
    type SecuEngagementScopeContact,
    type SecuEngagementScopeRule,
    type SecuEngagementScopeTarget,
    type SecuEngagementScopeWindow,
} from "@/db/individual/individual-schema";
import { entityService } from "../entities/entity.service";
import { relationshipService } from "../entities/relationship.service";
import { secuEventBus } from "../rules/event-bus";

export type EngagementSeverityCounts = {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
};

export type EngagementOwnerSummary = {
    id: number;
    displayName: string;
    avatarUrl: string | null;
};

export type EngagementListItem = Engagement & {
    findingsBySeverity: EngagementSeverityCounts;
    primaryDomain: string | null;
    owner: EngagementOwnerSummary | null;
};

// ─── Sprint 2 — Scope-Match-Helpers (Block 4) ────────────────────────────────

/**
 * Prüft ob ein Scope-Target eine Entity matched. Strategie pro Target-Kind:
 *   - domain                 → Entity-Kind asset_domain/asset_subdomain mit
 *                              gleichem Suffix (lowercased Comparison).
 *   - subdomain_pattern      → Wildcard `*.example.com` matcht *jede* Subdomain
 *                              von example.com (nicht aber example.com selbst).
 *   - ip                     → Entity-Kind asset_ip mit exaktem Match.
 *   - ip_range               → Entity-Kind asset_ip im CIDR-Range (IPv4 only).
 *   - url                    → Entity-Kind asset_url mit URL-Präfix-Match
 *                              (Origin-Vergleich, Pfad ist Präfix).
 *   - app | other            → free-text Substring-Match auf Entity.displayName
 *                              ODER canonicalKey.
 *   - email                  → Entity-Kind email_address, exakter local-part-Match.
 *   - person                 → Entity-Kind person, displayName-Substring.
 *
 * Der Match ist absichtlich konservativ — bei Unsicherheit eher kein Match,
 * damit wir nichts blocken was eigentlich erlaubt wäre. Out-of-scope-Regeln
 * werden trotzdem strikt durchgesetzt (siehe Reihenfolge in checkInScope).
 */
function matchTarget(target: SecuEngagementScopeTarget, entity: Entity): boolean {
    const tValue = String(target.value ?? "").trim().toLowerCase();
    if (tValue.length === 0) return false;

    const eName = entity.displayName.toLowerCase();
    const eCanon = entity.canonicalKey.toLowerCase();

    switch (target.kind) {
        case "domain": {
            if (entity.kind !== "asset_domain" && entity.kind !== "asset_subdomain") return false;
            return eName === tValue || eName.endsWith(`.${tValue}`) || eCanon === tValue || eCanon.endsWith(`.${tValue}`);
        }
        case "subdomain_pattern": {
            // unterstützt `*.example.com` und `example.com/*` als equivalent.
            const stripped = tValue.replace(/^\*\.|\/\*$/g, "");
            if (entity.kind !== "asset_subdomain" && entity.kind !== "asset_domain") return false;
            return eName !== stripped && (eName.endsWith(`.${stripped}`) || eCanon.endsWith(`.${stripped}`));
        }
        case "ip": {
            if (entity.kind !== "asset_ip") return false;
            return eCanon === tValue || eName === tValue;
        }
        case "ip_range": {
            if (entity.kind !== "asset_ip") return false;
            return ipv4InCidr(eCanon || eName, tValue);
        }
        case "url": {
            if (entity.kind !== "asset_url") return false;
            return eCanon.startsWith(tValue) || eName.startsWith(tValue);
        }
        case "email": {
            if (entity.kind !== "email_address") return false;
            return eCanon === tValue || eName === tValue;
        }
        case "person": {
            if (entity.kind !== "person") return false;
            return eName.includes(tValue) || eCanon.includes(tValue);
        }
        case "app":
        case "other":
        default:
            return eName.includes(tValue) || eCanon.includes(tValue);
    }
}

function ipv4InCidr(ip: string, cidr: string): boolean {
    const m = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
    if (!m) return false;
    const prefix = parseInt(m[5], 10);
    if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;
    const ipParts = ip.split(".").map((n) => parseInt(n, 10));
    if (ipParts.length !== 4 || ipParts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const cidrParts = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10)];
    const ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
    const cidrNum = ((cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3]) >>> 0;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (cidrNum & mask);
}

/**
 * Prüft, ob die aktuelle Server-Zeit in einem testWindow liegt. Erlaubt sich
 * den Pragmatismus, alle Server-lokalen Datums-Methoden zu nutzen — wir
 * setzen voraus, dass node-secu auf einer Box läuft, deren TZ entweder UTC
 * oder Europe/Berlin ist (sibling-Stack auf operator-Linux). Eine korrekte
 * IANA-zone Konvertierung würde Intl.DateTimeFormat erfordern und ist
 * Phase-3-würdig — kein Production-Blocker.
 */
function matchTestWindowNow(window: SecuEngagementScopeWindow): boolean {
    if (!Array.isArray(window.daysOfWeek) || window.daysOfWeek.length === 0) return true;
    const now = new Date();
    const dow = now.getDay();
    if (!window.daysOfWeek.includes(dow)) return false;

    const [fromH, fromM] = (window.fromTime ?? "00:00").split(":").map((n) => parseInt(n, 10));
    const [untilH, untilM] = (window.untilTime ?? "23:59").split(":").map((n) => parseInt(n, 10));
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const minutesFrom = (fromH || 0) * 60 + (fromM || 0);
    const minutesUntil = (untilH || 23) * 60 + (untilM || 59);
    if (minutesFrom <= minutesUntil) {
        return minutesNow >= minutesFrom && minutesNow <= minutesUntil;
    }
    // Window über Mitternacht (z.B. 22:00 → 06:00).
    return minutesNow >= minutesFrom || minutesNow <= minutesUntil;
}

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
        kind?: EngagementKind | EngagementKind[];
        ownerUserId?: number;
        limit?: number;
        offset?: number;
        sortBy?: "createdAt" | "updatedAt" | "name" | "status";
        order?: "asc" | "desc";
        search?: string;
    }): Promise<Engagement[]> {
        const conditions: SQL[] = [];
        if (!opts?.includeArchived) conditions.push(isNull(engagements.archivedAt));
        if (opts?.kind) {
            const kinds = Array.isArray(opts.kind) ? opts.kind : [opts.kind];
            if (kinds.length === 1) conditions.push(eq(engagements.kind, kinds[0]));
            else if (kinds.length > 1) conditions.push(inArray(engagements.kind, kinds));
        }
        if (opts?.ownerUserId != null) conditions.push(eq(engagements.ownerUserId, opts.ownerUserId));
        if (opts?.search && opts.search.trim()) {
            const term = `%${opts.search.trim()}%`;
            conditions.push(sql`(${engagements.name} ILIKE ${term} OR ${engagements.scopeSummary} ILIKE ${term})`);
        }

        const sortColumn = (() => {
            switch (opts?.sortBy) {
                case "updatedAt": return engagements.updatedAt;
                case "name": return engagements.name;
                case "status": return engagements.status;
                case "createdAt":
                default: return engagements.createdAt;
            }
        })();
        const direction = opts?.order === "asc" ? sortColumn : desc(sortColumn);

        let query = database
            .select()
            .from(engagements)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(direction)
            .$dynamic();
        if (opts?.limit != null) query = query.limit(opts.limit);
        if (opts?.offset != null) query = query.offset(opts.offset);
        return query;
    },

    /**
     * Engagement-List angereichert für die Frontend-Übersicht.
     * Liefert pro Engagement zusätzlich:
     *   - findingsBySeverity: Zähler offener Findings (status ∈ open/triaged/confirmed)
     *   - primaryDomain: Anzeigename der `asset_domain`/`asset_subdomain`-Entity mit
     *                    Rolle `primary_target` (oder erste asset_domain als Fallback)
     *   - owner: Bundle (id, displayName, avatarUrl) für ownerUserId
     *
     * Eine LIST-Page ⇒ vier Queries (Engagements + Severity-Aggregation +
     * Primary-Domains + Users). Kein N+1.
     */
    async listWithStats(opts?: {
        includeArchived?: boolean;
        kind?: EngagementKind | EngagementKind[];
        ownerUserId?: number;
        limit?: number;
        offset?: number;
        sortBy?: "createdAt" | "updatedAt" | "name" | "status";
        order?: "asc" | "desc";
        search?: string;
    }): Promise<EngagementListItem[]> {
        const rows = await this.list(opts);
        if (rows.length === 0) return [];

        const engagementIds = rows.map((r) => r.id);
        const ownerIds = Array.from(
            new Set(rows.map((r) => r.ownerUserId).filter((id): id is number => id != null)),
        );

        const [severityRows, primaryRows, ownerRows] = await Promise.all([
            // Open-Findings pro (engagementId, severity).
            database
                .select({
                    engagementId: findings.engagementId,
                    severity: findings.severity,
                    cnt: sql<number>`cast(count(*) as int)`.as("cnt"),
                })
                .from(findings)
                .where(
                    and(
                        inArray(findings.engagementId, engagementIds),
                        inArray(findings.status, ["open", "triaged", "confirmed"]),
                    ),
                )
                .groupBy(findings.engagementId, findings.severity),
            // Primary-Domain pro Engagement: bevorzugt role=primary_target + kind=asset_domain/asset_subdomain.
            // Fallback: erste asset_domain/asset_subdomain in beliebiger Rolle.
            database
                .select({
                    engagementId: engagementEntities.engagementId,
                    role: engagementEntities.role,
                    addedAt: engagementEntities.addedAt,
                    entityKind: entities.kind,
                    displayName: entities.displayName,
                })
                .from(engagementEntities)
                .innerJoin(entities, eq(entities.id, engagementEntities.entityId))
                .where(
                    and(
                        inArray(engagementEntities.engagementId, engagementIds),
                        inArray(entities.kind, ["asset_domain", "asset_subdomain"]),
                    ),
                ),
            ownerIds.length > 0
                ? database
                      .select({
                          id: users.id,
                          email: users.email,
                          firstName: users.firstName,
                          lastName: users.lastName,
                          name: users.name,
                      })
                      .from(users)
                      .where(inArray(users.id, ownerIds))
                : Promise.resolve(
                      [] as Array<{
                          id: number;
                          email: string | null;
                          firstName: string | null;
                          lastName: string | null;
                          name: string | null;
                      }>,
                  ),
        ]);

        const severityByEngagement = new Map<number, EngagementSeverityCounts>();
        for (const id of engagementIds) {
            severityByEngagement.set(id, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
        }
        for (const r of severityRows) {
            const bucket = severityByEngagement.get(r.engagementId);
            if (!bucket) continue;
            if (r.severity === "critical" || r.severity === "high" || r.severity === "medium" || r.severity === "low" || r.severity === "info") {
                bucket[r.severity] = (bucket[r.severity] ?? 0) + r.cnt;
            }
        }

        // Pro Engagement: zuerst primary_target+asset_domain, dann primary_target+asset_subdomain,
        // dann irgendeine asset_domain (älteste zuerst per addedAt für Stabilität).
        const primaryByEngagement = new Map<number, string>();
        const sortedPrimary = [...primaryRows].sort((a, b) => {
            const score = (row: typeof a) => {
                let s = 0;
                if (row.role === "primary_target") s += 100;
                if (row.entityKind === "asset_domain") s += 10;
                else if (row.entityKind === "asset_subdomain") s += 5;
                return s;
            };
            const diff = score(b) - score(a);
            if (diff !== 0) return diff;
            return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
        });
        for (const r of sortedPrimary) {
            if (!primaryByEngagement.has(r.engagementId)) {
                primaryByEngagement.set(r.engagementId, r.displayName);
            }
        }

        const ownerById = new Map<number, EngagementOwnerSummary>();
        for (const u of ownerRows) {
            const composed = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
            const displayName = u.name?.trim() || composed || u.email?.trim() || `op#${u.id}`;
            ownerById.set(u.id, { id: u.id, displayName, avatarUrl: null });
        }

        return rows.map((row) => ({
            ...row,
            findingsBySeverity:
                severityByEngagement.get(row.id) ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
            primaryDomain: primaryByEngagement.get(row.id) ?? null,
            owner: row.ownerUserId != null ? ownerById.get(row.ownerUserId) ?? null : null,
        }));
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

    async listAuthorizationsForEngagement(engagementId: number): Promise<Array<EntityAuthorization & { entity: Entity | null }>> {
        const links = await database
            .select({ entityId: engagementEntities.entityId })
            .from(engagementEntities)
            .where(eq(engagementEntities.engagementId, engagementId));
        if (links.length === 0) return [];

        const entityIds = links.map((l) => l.entityId);
        const [authRows, ents] = await Promise.all([
            database
                .select()
                .from(entityAuthorizations)
                .where(inArray(entityAuthorizations.entityId, entityIds))
                .orderBy(desc(entityAuthorizations.createdAt)),
            database.select().from(entities).where(inArray(entities.id, entityIds)),
        ]);
        const entityById = new Map(ents.map((entity) => [entity.id, entity]));
        return authRows.map((auth) => ({ ...auth, entity: entityById.get(auth.entityId) ?? null }));
    },

    async revokeAuthorizationInEngagement(input: {
        engagementId: number;
        authorizationId: number;
        revokedBy?: number | null;
    }): Promise<EntityAuthorization | null> {
        const [existing] = await database
            .select({ authorizationId: entityAuthorizations.id })
            .from(entityAuthorizations)
            .innerJoin(
                engagementEntities,
                and(
                    eq(engagementEntities.engagementId, input.engagementId),
                    eq(engagementEntities.entityId, entityAuthorizations.entityId),
                ),
            )
            .where(eq(entityAuthorizations.id, input.authorizationId))
            .limit(1);
        if (!existing) return null;

        const [updated] = await database
            .update(entityAuthorizations)
            .set({
                revokedAt: new Date(),
                revokedBy: input.revokedBy ?? null,
            })
            .where(eq(entityAuthorizations.id, input.authorizationId))
            .returning();
        return updated ?? null;
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

    /**
     * Sprint 2 (Backend-Report 2026-05-09 Block 2) — Note-Listing pro Engagement
     * inkl. Entity-Snapshot. Nutzt artifacts mit kind='note' (kein neues Tabellen-
     * Schema). Sortierbar nach createdAt/updatedAt; entityId-Filter stellt sicher,
     * dass die Drawer-View "alle Notes zur Person X" funktioniert.
     */
    async listNotes(input: {
        engagementId: number;
        entityId?: number | null;
        limit: number;
        offset: number;
        sortBy: "createdAt" | "updatedAt";
        order: "asc" | "desc";
    }): Promise<Array<Artifact & { entity: { id: number; kind: EntityKind; displayName: string } | null }>> {
        const conditions: SQL[] = [
            eq(artifacts.engagementId, input.engagementId),
            eq(artifacts.kind, "note"),
        ];
        if (input.entityId != null) conditions.push(eq(artifacts.entityId, input.entityId));

        const sortColumn = input.sortBy === "updatedAt"
            ? sql`coalesce(${artifacts.updatedAt}, ${artifacts.capturedAt})`
            : artifacts.capturedAt;
        const direction = input.order === "asc" ? asc(sortColumn) : desc(sortColumn);

        const rows = await database
            .select({
                artifact: artifacts,
                entity: { id: entities.id, kind: entities.kind, displayName: entities.displayName },
            })
            .from(artifacts)
            .leftJoin(entities, eq(entities.id, artifacts.entityId))
            .where(and(...conditions))
            .orderBy(direction)
            .limit(Math.min(Math.max(input.limit, 1), 500))
            .offset(Math.max(input.offset, 0));

        return rows.map((r) => ({
            ...r.artifact,
            entity: r.entity?.id ? r.entity : null,
        }));
    },

    async updateNote(input: {
        engagementId: number;
        noteId: number;
        title?: string | null;
        body?: string;
        entityId?: number | null;
        actorUserId: number | null;
    }): Promise<Artifact | null> {
        const patch: Partial<typeof artifacts.$inferInsert> = {
            updatedAt: new Date(),
            updatedBy: input.actorUserId,
        };
        if (input.title !== undefined) patch.title = input.title;
        if (input.body !== undefined) patch.body = input.body;
        if (input.entityId !== undefined) patch.entityId = input.entityId;

        const [updated] = await database
            .update(artifacts)
            .set(patch)
            .where(and(
                eq(artifacts.id, input.noteId),
                eq(artifacts.engagementId, input.engagementId),
                eq(artifacts.kind, "note"),
            ))
            .returning();
        return updated ?? null;
    },

    async deleteNote(input: {
        engagementId: number;
        noteId: number;
    }): Promise<Artifact | null> {
        const [deleted] = await database
            .delete(artifacts)
            .where(and(
                eq(artifacts.id, input.noteId),
                eq(artifacts.engagementId, input.engagementId),
                eq(artifacts.kind, "note"),
            ))
            .returning();
        return deleted ?? null;
    },

    // ─── Scope (Sprint 2, Backend-Report Block 4) ───────────────────────

    /**
     * Komplett-Ersatz der strukturierten Scope-Definition. Behält IDs bestehender
     * Targets/Rules/Windows/Contacts wenn Caller welche mitschickt; vergibt frische
     * IDs für alle anderen, damit Frontend stable Refs hat.
     */
    async replaceScope(input: {
        engagementId: number;
        summary?: string | null;
        targets?: Array<Partial<SecuEngagementScopeTarget>> | undefined;
        rulesOfEngagement?: Array<Partial<SecuEngagementScopeRule>> | undefined;
        testWindows?: Array<Partial<SecuEngagementScopeWindow>> | undefined;
        notificationContacts?: Array<Partial<SecuEngagementScopeContact>> | undefined;
        confirmedByUserId?: number | null;
    }): Promise<Engagement | null> {
        const [current] = await database.select().from(engagements).where(eq(engagements.id, input.engagementId)).limit(1);
        if (!current) return null;

        const stableId = (existing: string | undefined): string => existing && existing.trim() !== "" ? existing : `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const nextScope: SecuEngagementScope = {
            ...(current.scope ?? {}),
            targets: (input.targets ?? current.scope?.targets ?? []).map((t) => ({
                id: stableId(t.id),
                kind: (t.kind ?? "domain") as SecuEngagementScopeTarget["kind"],
                value: String(t.value ?? "").trim(),
                rule: (t.rule ?? "in_scope") as SecuEngagementScopeTarget["rule"],
                notes: t.notes ?? null,
            })).filter((t) => t.value.length > 0),
            rulesOfEngagement: (input.rulesOfEngagement ?? current.scope?.rulesOfEngagement ?? []).map((r) => ({
                id: stableId(r.id),
                text: String(r.text ?? "").trim(),
                severity: (r.severity ?? "should") as SecuEngagementScopeRule["severity"],
            })).filter((r) => r.text.length > 0),
            testWindows: (input.testWindows ?? current.scope?.testWindows ?? []).map((w) => ({
                id: stableId(w.id),
                timezone: w.timezone ?? "Europe/Berlin",
                daysOfWeek: Array.isArray(w.daysOfWeek) ? w.daysOfWeek.filter((d) => Number.isFinite(d) && d >= 0 && d <= 6) : [1, 2, 3, 4, 5],
                fromTime: w.fromTime ?? "09:00",
                untilTime: w.untilTime ?? "18:00",
            })),
            notificationContacts: (input.notificationContacts ?? current.scope?.notificationContacts ?? []).map((c) => ({
                id: stableId(c.id),
                name: String(c.name ?? "").trim(),
                email: c.email ?? null,
                phone: c.phone ?? null,
                onSeverityAtLeast: (c.onSeverityAtLeast ?? "high") as SecuEngagementScopeContact["onSeverityAtLeast"],
            })).filter((c) => c.name.length > 0),
            confirmedAt: input.confirmedByUserId != null ? new Date().toISOString() : current.scope?.confirmedAt ?? null,
            confirmedByUserId: input.confirmedByUserId ?? current.scope?.confirmedByUserId ?? null,
        };

        const patch: Partial<typeof engagements.$inferInsert> = {
            scope: nextScope,
            updatedAt: new Date(),
        };
        if (input.summary !== undefined) patch.scopeSummary = input.summary;

        const [updated] = await database
            .update(engagements)
            .set(patch)
            .where(eq(engagements.id, input.engagementId))
            .returning();
        return updated ?? null;
    },

    /**
     * Sprint 2 — Scope-Gate für active_safe / active_intrusive Worker.
     * Wird vom worker-runner VOR der Tool-Execution aufgerufen. Reihenfolge:
     *
     *   1) Wenn ein `out_of_scope`-Target matched → blocken mit reason="out_of_scope".
     *   2) Wenn `targets[]` mind. einen `in_scope`-Eintrag enthält UND nichts matched
     *      → blocken mit reason="not_in_explicit_scope" (Operator hat Scope explizit
     *      definiert, aber das Target steht nicht drin).
     *   3) Wenn keine in_scope-Targets definiert sind → erlauben (Backwards-compat:
     *      ältere Engagements ohne Scope-Editor laufen weiter).
     *   4) testWindows: wenn definiert, nur innerhalb der Fenster aktive Worker
     *      laufen lassen (passive bleibt unbetroffen, der Caller checked das).
     */
    async checkInScope(input: {
        engagementId: number;
        entityId: number;
        requiredScope: AuthorizationScopeType;
    }): Promise<{ allowed: boolean; reason?: string }> {
        const [engagement] = await database
            .select({ scope: engagements.scope })
            .from(engagements)
            .where(eq(engagements.id, input.engagementId))
            .limit(1);
        if (!engagement) return { allowed: false, reason: "engagement_not_found" };
        const scope = engagement.scope ?? {};

        const targets = Array.isArray(scope.targets) ? scope.targets : [];
        if (targets.length > 0) {
            const [entity] = await database.select().from(entities).where(eq(entities.id, input.entityId)).limit(1);
            if (!entity) return { allowed: false, reason: "entity_not_found" };

            const matchedOut = targets.find((t) => t.rule === "out_of_scope" && matchTarget(t, entity));
            if (matchedOut) return { allowed: false, reason: `out_of_scope:${matchedOut.value}` };

            const hasInScope = targets.some((t) => t.rule === "in_scope");
            if (hasInScope) {
                const matchedIn = targets.find((t) => t.rule === "in_scope" && matchTarget(t, entity));
                if (!matchedIn) return { allowed: false, reason: "not_in_explicit_scope" };
            }
        }

        const windows = Array.isArray(scope.testWindows) ? scope.testWindows : [];
        if (windows.length > 0 && input.requiredScope !== "passive_only") {
            const inWindow = windows.some(matchTestWindowNow);
            if (!inWindow) return { allowed: false, reason: "outside_test_window" };
        }

        return { allowed: true };
    },

    // ─── Alias-Linking (Sprint 2, Backend-Report Block 5) ───────────────

    /**
     * Symmetrischer Alias-Link für username/phone/social_account. Verhalten
     * identisch zu `linkOsintEmailEntity`: upsert Entity → engagement-link →
     * optional an Person verlinken → Auto-Chain via entity.created-Event.
     *
     * Diskrimnator wird für username (platform) genutzt, damit derselbe
     * username auf zwei Plattformen (z.B. github+twitter) zwei Entities ergibt.
     */
    async linkAliasEntity(input: {
        engagementId: number;
        aliasKind: "username" | "phone_number" | "social_account";
        primaryValue: string;
        discriminator?: string | null;
        data: Record<string, unknown>;
        personId: number | null;
        relationshipKind: "owns_username" | "owns_phone" | "owns_social_account";
        addedByUserId: number | null;
    }): Promise<{
        entity: Entity;
        engagementEntityId: number;
        relationshipId: number | null;
    }> {
        const display = input.discriminator
            ? `${input.discriminator}:${input.primaryValue}`
            : input.primaryValue;

        const entity = await entityService.upsert({
            kind: input.aliasKind,
            displayName: display,
            canonical: {
                kind: input.aliasKind,
                primaryValue: input.primaryValue,
                discriminator: input.discriminator ?? null,
            },
            data: input.data,
        });

        const link = await this.linkEntity({
            engagementId: input.engagementId,
            entityId: entity.id,
            addedBy: input.addedByUserId,
        });

        let relId: number | null = null;
        if (input.personId) {
            const rel = await relationshipService.upsert({
                fromEntityId: input.personId,
                toEntityId: entity.id,
                kind: input.relationshipKind,
                confidence: 100,
                source: "manual_api",
            });
            relId = rel.id;
        }

        // entity.linked-Event für UI-Live-Update.
        if (link.created) {
            secuEventBus.publish({
                type: "entity.linked",
                engagementId: input.engagementId,
                entityId: entity.id,
                engagementEntityId: link.id,
                role: "in_scope",
                actorUserId: input.addedByUserId,
                entitySnapshot: { kind: entity.kind, displayName: entity.displayName, canonicalKey: entity.canonicalKey },
            });
        }

        return { entity, engagementEntityId: link.id, relationshipId: relId };
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

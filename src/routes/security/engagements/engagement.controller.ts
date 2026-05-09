import type { Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { database } from "@/db";
import {
    entities,
    entityAuthorizations,
    secuSignalChainLog,
} from "@/db/individual/individual-schema";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { authorizationService } from "@/lib/security/authorization/authorization.service";
import { engagementService } from "@/lib/security/engagements/engagement.service";
import { graphService } from "@/lib/security/engagements/graph.service";
import { entityService } from "@/lib/security/entities/entity.service";
import { relationshipService } from "@/lib/security/entities/relationship.service";
import { secuEventBus } from "@/lib/security/rules/event-bus";
import type {
    EngagementCreateBody,
    EngagementEntityLinkBody,
    EngagementListQuery,
    EngagementNoteBody,
    EngagementUpdateBody,
    GrantAuthBody,
    OsintEmailEntityBody,
} from "./engagement.dto";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { normalizePagination } from "@/api-contract/pagination.dto";
import { getUserIdFromRequest } from "@/util/utils";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class EngagementController {
    async create(req: Request, res: Response) {
        try {
            const body = v<EngagementCreateBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            if (body.primaryDomain) {
                const { engagement, entity } = await engagementService.createWithPrimaryDomain({
                    name: body.name,
                    kind: body.kind,
                    status: body.status,
                    scopeSummary: body.scopeSummary ?? null,
                    ownerUserId: userId,
                    primaryDomain: body.primaryDomain,
                });
                await auditLogService.log({
                    action: "engagement.create",
                    actorUserId: userId,
                    engagementId: engagement.id,
                    targetType: "engagement",
                    targetId: engagement.id,
                    payload: { kind: body.kind, primaryDomain: body.primaryDomain, primaryEntityId: entity.id },
                });
                return responseHandler(res, 201, undefined, { engagement, primaryEntity: entity });
            }

            const engagement = await engagementService.create({
                name: body.name,
                kind: body.kind,
                status: body.status,
                scopeSummary: body.scopeSummary ?? null,
                ownerUserId: userId,
            });
            await auditLogService.log({
                action: "engagement.create",
                actorUserId: userId,
                engagementId: engagement.id,
                targetType: "engagement",
                targetId: engagement.id,
                payload: { kind: body.kind },
            });
            return responseHandler(res, 201, undefined, { engagement });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async list(req: Request, res: Response) {
        try {
            const q = v<EngagementListQuery>(req, "query");
            const p = normalizePagination(q, { defaultSort: "createdAt", defaultOrder: "desc", defaultLimit: 50 });
            const rows = await engagementService.listWithStats({
                includeArchived: q.includeArchived,
                kind: q.kind,
                ownerUserId: q.ownerUserId,
                limit: p.limit,
                offset: p.offset,
                sortBy: p.sortBy as any,
                order: p.order,
                search: q.search,
            });
            return responseHandler(res, 200, undefined, rows);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async getById(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const engagement = await engagementService.getById(id);
            if (!engagement) return responseHandler(res, 404, "Engagement not found");

            const [graph, counts] = await Promise.all([
                graphService.buildForEngagement(id),
                engagementService.getCounts(id),
            ]);

            return responseHandler(res, 200, undefined, {
                ...engagement,
                graph,
                entityCount: counts.entityCount,
                findingCount: counts.findingCount,
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<EngagementUpdateBody>(req, "body");
            const updated = await engagementService.update(id, body);
            if (!updated) return responseHandler(res, 404, "Engagement not found");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            await auditLogService.log({
                action: "engagement.update",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement",
                targetId: id,
                payload: body as any,
            });
            return responseHandler(res, 200, undefined, updated);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async archive(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const archived = await engagementService.archive(id);
            if (!archived) return responseHandler(res, 404, "Engagement not found");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            await auditLogService.log({
                action: "engagement.archive",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement",
                targetId: id,
            });
            return responseHandler(res, 200, undefined, archived);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async getGraph(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const graph = await graphService.buildForEngagement(id);
            return responseHandler(res, 200, undefined, graph);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async listEntities(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const q = v<{ kind?: string }>(req, "query");
            const rows = await engagementService.listEntitiesForEngagement(id, { kind: q.kind });
            return responseHandler(res, 200, undefined, rows);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async linkEntity(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<EngagementEntityLinkBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            let entityId = body.entityId;
            if (!entityId && body.upsert) {
                const ent = await entityService.upsert({
                    kind: body.upsert.kind,
                    displayName: body.upsert.displayName,
                    canonical: {
                        kind: body.upsert.kind,
                        primaryValue: body.upsert.primaryValue,
                        discriminator: body.upsert.discriminator ?? null,
                    },
                    data: body.upsert.data,
                });
                entityId = ent.id;
            }
            if (!entityId) return responseHandler(res, 400, "entityId or upsert required");

            const result = await engagementService.linkEntity({
                engagementId: id,
                entityId,
                role: body.role,
                notes: body.notes ?? null,
                addedBy: userId,
            });
            await auditLogService.log({
                action: "engagement.link_entity",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement_entity",
                targetId: result.id,
                payload: { entityId, role: body.role ?? "in_scope", created: result.created },
            });

            // Sprint 2 — entity.linked Event nur emittieren wenn Link tatsächlich neu;
            // bei reinem Role-Update (created=false) ist der WS-Subscriber an einem
            // entity.updated-Vergleich besser bedient.
            if (result.created) {
                const ent = await entityService.getById(entityId);
                if (ent) {
                    secuEventBus.publish({
                        type: "entity.linked",
                        engagementId: id,
                        entityId,
                        engagementEntityId: result.id,
                        role: body.role ?? "in_scope",
                        actorUserId: userId,
                        entitySnapshot: { kind: ent.kind, displayName: ent.displayName, canonicalKey: ent.canonicalKey },
                    });
                }
            }
            return responseHandler(res, result.created ? 201 : 200, undefined, { ...result, entityId });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async unlinkEntity(req: Request, res: Response) {
        try {
            const { id, entityId } = v<{ id: number; entityId: number }>(req, "params");
            const ent = await entityService.getById(entityId);
            await engagementService.unlinkEntity(id, entityId);
            const userId = (await getUserIdFromRequest(req)) ?? null;
            await auditLogService.log({
                action: "engagement.unlink_entity",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement",
                targetId: id,
                payload: { entityId },
            });
            if (ent) {
                secuEventBus.publish({
                    type: "entity.unlinked",
                    engagementId: id,
                    entityId,
                    engagementEntityId: null,
                    role: null,
                    actorUserId: userId,
                    entitySnapshot: { kind: ent.kind, displayName: ent.displayName, canonicalKey: ent.canonicalKey },
                });
            }
            return responseHandler(res, 204);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async addNote(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<EngagementNoteBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const noteId = await engagementService.addNote({
                engagementId: id,
                body: body.body,
                title: body.title ?? null,
                entityId: body.entityId ?? null,
                createdBy: userId,
            });
            secuEventBus.publish({
                type: "note.created",
                noteId,
                engagementId: id,
                entityId: body.entityId ?? null,
                title: body.title ?? null,
                excerpt: body.body.slice(0, 80),
                actorUserId: userId,
            });
            return responseHandler(res, 201, undefined, { id: noteId });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async listNotes(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const q = v<{ entityId?: number; limit?: number; offset?: number; sortBy?: "createdAt" | "updatedAt"; order?: "asc" | "desc" }>(req, "query");
            const rows = await engagementService.listNotes({
                engagementId: id,
                entityId: q.entityId ?? null,
                limit: q.limit ?? 100,
                offset: q.offset ?? 0,
                sortBy: q.sortBy ?? "createdAt",
                order: q.order ?? "desc",
            });
            return responseHandler(res, 200, undefined, rows);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async updateNote(req: Request, res: Response) {
        try {
            const { id, noteId } = v<{ id: number; noteId: number }>(req, "params");
            const body = v<{ title?: string | null; body?: string; entityId?: number | null }>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const updated = await engagementService.updateNote({
                engagementId: id,
                noteId,
                title: body.title,
                body: body.body,
                entityId: body.entityId,
                actorUserId: userId,
            });
            if (!updated) return responseHandler(res, 404, "Note not found in this engagement");
            secuEventBus.publish({
                type: "note.updated",
                noteId: updated.id,
                engagementId: id,
                entityId: updated.entityId,
                title: updated.title,
                excerpt: (updated.body ?? "").slice(0, 80),
                actorUserId: userId,
            });
            return responseHandler(res, 200, undefined, updated);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async deleteNote(req: Request, res: Response) {
        try {
            const { id, noteId } = v<{ id: number; noteId: number }>(req, "params");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const deleted = await engagementService.deleteNote({ engagementId: id, noteId });
            if (!deleted) return responseHandler(res, 404, "Note not found in this engagement");
            secuEventBus.publish({
                type: "note.deleted",
                noteId,
                engagementId: id,
                entityId: deleted.entityId,
                title: deleted.title,
                excerpt: "",
                actorUserId: userId,
            });
            return responseHandler(res, 204);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async grantAuthorization(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<GrantAuthBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const link = await engagementService.linkEntity({
                engagementId: id,
                entityId: body.entityId,
                addedBy: userId,
            });
            const authId = await engagementService.grantAuthorization({
                entityId: body.entityId,
                kind: body.kind,
                scope: body.scope,
                proofType: body.proofType,
                proofRef: body.proofRef ?? null,
                verifiedAt: body.verifiedAt ?? null,
                expiresAt: body.expiresAt ?? null,
                notes: body.notes ?? null,
                grantedBy: userId,
            });
            await auditLogService.log({
                action: "auth.grant",
                actorUserId: userId,
                engagementId: id,
                targetType: "entity_authorization",
                targetId: authId,
                payload: { entityId: body.entityId, kind: body.kind, scope: body.scope },
            });
            secuEventBus.publish({
                type: "auth.granted",
                engagementId: id,
                authorizationId: authId,
                entityId: body.entityId,
                kind: body.kind,
                scope: body.scope,
                actorUserId: userId,
            });
            return responseHandler(res, 201, undefined, { authorizationId: authId, engagementEntityId: link.id });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async listAuthorizations(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const engagement = await engagementService.getById(id);
            if (!engagement) return responseHandler(res, 404, "Engagement not found");

            const rows = await engagementService.listAuthorizationsForEngagement(id);
            const out = await Promise.all(rows.map(async (row) => {
                const activeSafe = await authorizationService.canScan({ kind: "entity", id: row.entityId }, "active_safe");
                const activeIntrusive = await authorizationService.canScan({ kind: "entity", id: row.entityId }, "active_intrusive");
                return {
                    ...row,
                    decision: {
                        activeSafeAllowed: activeSafe.allowed,
                        activeSafeReason: activeSafe.reason,
                        activeIntrusiveAllowed: activeIntrusive.allowed,
                        activeIntrusiveReason: activeIntrusive.reason,
                    },
                };
            }));
            return responseHandler(res, 200, undefined, out);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async revokeAuthorization(req: Request, res: Response) {
        try {
            const { id, authorizationId } = v<{ id: number; authorizationId: number }>(req, "params");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const revoked = await engagementService.revokeAuthorizationInEngagement({
                engagementId: id,
                authorizationId,
                revokedBy: userId,
            });
            if (!revoked) return responseHandler(res, 404, "Authorization not found in this engagement");

            await auditLogService.log({
                action: "auth.revoke",
                actorUserId: userId,
                engagementId: id,
                targetType: "entity_authorization",
                targetId: authorizationId,
                payload: { entityId: revoked.entityId, scope: revoked.scope, kind: revoked.kind },
            });
            secuEventBus.publish({
                type: "auth.revoked",
                engagementId: id,
                authorizationId,
                entityId: revoked.entityId,
                kind: revoked.kind,
                scope: revoked.scope,
                actorUserId: userId,
            });
            return responseHandler(res, 200, undefined, {
                authorizationId,
                revokedAt: revoked.revokedAt?.toISOString() ?? new Date().toISOString(),
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * Phase 2.7 — POST /engagements/:id/entities/email
     * Convenience-Endpoint: legt eine email_address-Entity an, verlinkt sie zum
     * Engagement, optional zu einer Person via owns_email-Relationship. Auto-Chain
     * (osint_email_passive) feuert via entity.created-Event automatisch.
     */
    async linkOsintEmailEntity(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<OsintEmailEntityBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const email = body.email.trim().toLowerCase();
            const [local, domain] = email.split("@");

            const entity = await entityService.upsert({
                kind: "email_address",
                displayName: email,
                canonical: { kind: "email_address", primaryValue: email },
                data: { local, domain, addedManually: true, addedBy: userId },
            });

            const link = await engagementService.linkEntity({
                engagementId: id,
                entityId: entity.id,
                addedBy: userId,
            });

            let relId: number | null = null;
            if (body.personId) {
                const rel = await relationshipService.upsert({
                    fromEntityId: body.personId,
                    toEntityId: entity.id,
                    kind: "owns_email",
                    confidence: 100,
                    source: "manual_api",
                });
                relId = rel.id;
            }

            await auditLogService.log({
                action: "engagement.osint_email_link",
                actorUserId: userId,
                engagementId: id,
                targetType: "entity",
                targetId: entity.id,
                payload: { email, personId: body.personId ?? null, relationshipId: relId },
            });

            return responseHandler(res, 201, undefined, {
                entity,
                engagementEntityId: link.id,
                relationshipId: relId,
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * Phase 2.7 — GET /engagements/:id/signal-chains
     * Sprint 2 — Pagination via limit/offset (Backend-Report Klärung #2).
     * Listet OSINT-Signal-Chain-Logs für das Engagement (osint_person_full-Triggers,
     * manuelle Recon-Auslösung). Sortiert: neueste zuerst.
     */
    async listSignalChains(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const q = v<{ limit?: number; offset?: number }>(req, "query");
            const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
            const offset = Math.max(q.offset ?? 0, 0);
            const [rows, totalRow] = await Promise.all([
                database
                    .select()
                    .from(secuSignalChainLog)
                    .where(eq(secuSignalChainLog.engagementId, id))
                    .orderBy(desc(secuSignalChainLog.startedAt))
                    .limit(limit)
                    .offset(offset),
                database
                    .select({ cnt: sql<number>`cast(count(*) as int)` })
                    .from(secuSignalChainLog)
                    .where(eq(secuSignalChainLog.engagementId, id)),
            ]);
            return responseHandler(res, 200, undefined, { items: rows, total: totalRow[0]?.cnt ?? 0, limit, offset });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * Sprint 2 (Backend-Report 2026-05-09 Block 4) — GET /engagements/:id/scope.
     * Liefert die strukturierte Scope-Definition. Wenn noch nichts gesetzt ist,
     * wird ein leeres Default-Objekt zurückgegeben — FE rendert dann direkt
     * den Editor-Empty-State.
     */
    async getScope(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const engagement = await engagementService.getById(id);
            if (!engagement) return responseHandler(res, 404, "Engagement not found");
            return responseHandler(res, 200, undefined, {
                summary: engagement.scopeSummary,
                ...(engagement.scope ?? {}),
                targets: engagement.scope?.targets ?? [],
                rulesOfEngagement: engagement.scope?.rulesOfEngagement ?? [],
                testWindows: engagement.scope?.testWindows ?? [],
                notificationContacts: engagement.scope?.notificationContacts ?? [],
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * Sprint 2 — PUT /engagements/:id/scope. Komplette Ersetzung. Frontend
     * managed lokal, Backend persistiert. Optional `summary` aktualisiert
     * gleichzeitig das Markdown-Feld `scopeSummary`.
     */
    async putScope(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<{
                summary?: string | null;
                targets?: any[];
                rulesOfEngagement?: any[];
                testWindows?: any[];
                notificationContacts?: any[];
                confirmed?: boolean;
            }>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const updated = await engagementService.replaceScope({
                engagementId: id,
                summary: body.summary,
                targets: body.targets,
                rulesOfEngagement: body.rulesOfEngagement,
                testWindows: body.testWindows,
                notificationContacts: body.notificationContacts,
                confirmedByUserId: body.confirmed ? userId : null,
            });
            if (!updated) return responseHandler(res, 404, "Engagement not found");
            await auditLogService.log({
                action: "engagement.scope_update",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement",
                targetId: id,
                payload: { keys: Object.keys(body) },
            });
            secuEventBus.publish({
                type: "scope.updated",
                engagementId: id,
                section: "full",
                actorUserId: userId,
            });
            return responseHandler(res, 200, undefined, {
                summary: updated.scopeSummary,
                ...(updated.scope ?? {}),
                targets: updated.scope?.targets ?? [],
                rulesOfEngagement: updated.scope?.rulesOfEngagement ?? [],
                testWindows: updated.scope?.testWindows ?? [],
                notificationContacts: updated.scope?.notificationContacts ?? [],
            });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    /**
     * Sprint 2 (Backend-Report 2026-05-09 Block 5) — POST /engagements/:id/entities/username
     * Symmetrisch zu osint_email_link. Legt eine username-Entity an, verlinkt
     * sie zum Engagement, optional an eine Person, und triggert die OSINT-
     * Auto-Chain (Rule 5: osint_username_passive feuert via entity.created).
     */
    async linkOsintUsernameEntity(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<{ username: string; platform?: string | null; personId?: number | null }>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const result = await engagementService.linkAliasEntity({
                engagementId: id,
                aliasKind: "username",
                primaryValue: body.username,
                discriminator: body.platform ?? null,
                data: { value: body.username, normalized: body.username.toLowerCase(), platform: body.platform ?? null, addedManually: true, addedBy: userId },
                personId: body.personId ?? null,
                relationshipKind: "owns_username",
                addedByUserId: userId,
            });
            await auditLogService.log({
                action: "engagement.osint_username_link",
                actorUserId: userId,
                engagementId: id,
                targetType: "entity",
                targetId: result.entity.id,
                payload: { username: body.username, platform: body.platform ?? null, personId: body.personId ?? null, relationshipId: result.relationshipId },
            });
            return responseHandler(res, 201, undefined, result);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async linkOsintPhoneEntity(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<{ phone: string; personId?: number | null }>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const result = await engagementService.linkAliasEntity({
                engagementId: id,
                aliasKind: "phone_number",
                primaryValue: body.phone,
                data: { e164: body.phone, addedManually: true, addedBy: userId },
                personId: body.personId ?? null,
                relationshipKind: "owns_phone",
                addedByUserId: userId,
            });
            await auditLogService.log({
                action: "engagement.osint_phone_link",
                actorUserId: userId,
                engagementId: id,
                targetType: "entity",
                targetId: result.entity.id,
                payload: { phone: body.phone, personId: body.personId ?? null, relationshipId: result.relationshipId },
            });
            return responseHandler(res, 201, undefined, result);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async linkOsintSocialEntity(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<{ platform: string; handle: string; profileUrl?: string | null; personId?: number | null }>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const canonicalValue = `${body.platform.toLowerCase()}:${body.handle.toLowerCase()}`;
            const result = await engagementService.linkAliasEntity({
                engagementId: id,
                aliasKind: "social_account",
                primaryValue: canonicalValue,
                data: {
                    platform: body.platform,
                    handle: body.handle,
                    profileUrl: body.profileUrl ?? null,
                    addedManually: true,
                    addedBy: userId,
                },
                personId: body.personId ?? null,
                relationshipKind: "owns_social_account",
                addedByUserId: userId,
            });
            await auditLogService.log({
                action: "engagement.osint_social_link",
                actorUserId: userId,
                engagementId: id,
                targetType: "entity",
                targetId: result.entity.id,
                payload: { platform: body.platform, handle: body.handle, personId: body.personId ?? null, relationshipId: result.relationshipId },
            });
            return responseHandler(res, 201, undefined, result);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

void entities; void entityAuthorizations; void and;

export const engagementController = new EngagementController();

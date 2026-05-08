import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { engagementService } from "@/lib/security/engagements/engagement.service";
import { graphService } from "@/lib/security/engagements/graph.service";
import { entityService } from "@/lib/security/entities/entity.service";
import type {
    EngagementCreateBody,
    EngagementEntityLinkBody,
    EngagementListQuery,
    EngagementNoteBody,
    EngagementUpdateBody,
    GrantAuthBody,
} from "./engagement.dto";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
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
            const rows = await engagementService.list({
                includeArchived: q.includeArchived,
                kind: q.kind,
                ownerUserId: q.ownerUserId,
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
            return responseHandler(res, result.created ? 201 : 200, undefined, { ...result, entityId });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async unlinkEntity(req: Request, res: Response) {
        try {
            const { id, entityId } = v<{ id: number; entityId: number }>(req, "params");
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
            return responseHandler(res, 201, undefined, { id: noteId });
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
            return responseHandler(res, 201, undefined, { authorizationId: authId, engagementEntityId: link.id });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const engagementController = new EngagementController();

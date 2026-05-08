import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { entityService } from "@/lib/security/entities/entity.service";
import { relationshipService } from "@/lib/security/entities/relationship.service";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { getUserIdFromRequest } from "@/util/utils";
import type {
    EntityCreateBody,
    EntityListQuery,
    EntityRelationshipBody,
    EntityTagBody,
} from "./entity.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class EntityController {
    async upsert(req: Request, res: Response) {
        try {
            const body = v<EntityCreateBody>(req, "body");
            const ent = await entityService.upsert({
                kind: body.kind,
                displayName: body.displayName,
                canonical: {
                    kind: body.kind,
                    primaryValue: body.primaryValue,
                    discriminator: body.discriminator ?? null,
                },
                data: body.data,
            });
            const userId = (await getUserIdFromRequest(req)) ?? null;
            await auditLogService.log({
                action: "entity.upsert",
                actorUserId: userId,
                targetType: "entity",
                targetId: ent.id,
                payload: { kind: body.kind, canonicalKey: ent.canonicalKey },
            });
            return responseHandler(res, 200, undefined, ent);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async list(req: Request, res: Response) {
        try {
            const q = v<EntityListQuery>(req, "query");
            const rows = await entityService.search(q);
            return responseHandler(res, 200, undefined, rows);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async getDetail(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const detail = await entityService.getDetail(id);
            if (!detail) return responseHandler(res, 404, "Entity not found");
            return responseHandler(res, 200, undefined, detail);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async listRelationships(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const rows = await relationshipService.listForEntity(id);
            return responseHandler(res, 200, undefined, rows);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async createRelationship(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<EntityRelationshipBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const rel = await relationshipService.upsert({
                fromEntityId: id,
                toEntityId: body.toEntityId,
                kind: body.kind,
                confidence: body.confidence,
                source: body.source,
                data: body.data,
            });
            await auditLogService.log({
                action: "entity.relationship.upsert",
                actorUserId: userId,
                targetType: "entity_relationship",
                targetId: rel.id,
                payload: { fromEntityId: id, toEntityId: body.toEntityId, kind: body.kind },
            });
            return responseHandler(res, 201, undefined, rel);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async addTag(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<EntityTagBody>(req, "body");
            await entityService.addTag(id, body.tag, body.color ?? null);
            return responseHandler(res, 201, undefined, { tag: body.tag });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const entityController = new EntityController();

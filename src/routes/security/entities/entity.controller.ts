import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { entityService } from "@/lib/security/entities/entity.service";
import { relationshipService } from "@/lib/security/entities/relationship.service";
import { osintPersonFullService } from "@/lib/security/osint/person-full.service";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { getUserIdFromRequest } from "@/util/utils";
import type {
    EntityCreateBody,
    EntityEnrichFullBody,
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

    /**
     * Phase 2.7 — POST /entities/:id/enrich/full
     * Triggert das osint_person_full-Aggregat: lädt verlinkte Identitäten und
     * startet pro Identität das passende OSINT-Playbook. Schreibt initialen
     * signal_chain_log-Eintrag, Sub-Runs laufen async. Liefert chain-log-ID
     * direkt zurück.
     */
    async enrichFull(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<EntityEnrichFullBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const result = await osintPersonFullService.run({
                engagementId: body.engagementId,
                rootEntityId: id,
                triggeredByUserId: userId,
            });
            await auditLogService.log({
                action: "entity.enrich_full",
                actorUserId: userId,
                engagementId: body.engagementId,
                targetType: "entity",
                targetId: id,
                payload: {
                    signalChainLogId: result.signalChainLogId,
                    subRuns: result.subPlaybookRuns.map((s) => ({ runId: s.runId, playbookKey: s.playbookKey })),
                },
            });
            return responseHandler(res, 202, undefined, result);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const entityController = new EntityController();

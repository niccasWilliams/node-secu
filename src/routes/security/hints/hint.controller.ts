import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { engagementService } from "@/lib/security/engagements/engagement.service";
import { hintService } from "@/lib/security/hints/hint.service";
import { getUserIdFromRequest } from "@/util/utils";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import type { HintCreateBody, HintListQuery, HintPatchBody } from "./hint.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class HintController {
    async list(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const q = v<HintListQuery>(req, "query");
            const engagement = await engagementService.getById(id);
            if (!engagement) return responseHandler(res, 404, "Engagement not found");

            const all = await hintService.list(id);
            const hints = all
                .filter((h) => !q.status || h.status === q.status)
                .filter((h) => !q.slot || h.slot === q.slot);
            return responseHandler(res, 200, undefined, hints);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async create(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<HintCreateBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const engagement = await engagementService.getById(id);
            if (!engagement) return responseHandler(res, 404, "Engagement not found");

            const created = await hintService.createMany(id, body.items, userId);

            await auditLogService.log({
                action: "engagement.hint_create",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement_hint",
                payload: {
                    count: created.length,
                    slots: created.map((h) => h.slot),
                    hintIds: created.map((h) => h.id),
                },
            });

            return responseHandler(res, 201, undefined, created);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async patch(req: Request, res: Response) {
        try {
            const { id, hintId } = v<{ id: number; hintId: number }>(req, "params");
            const body = v<HintPatchBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const existing = await hintService.getInEngagement(id, hintId);
            if (!existing) return responseHandler(res, 404, "Hint not found in this engagement");

            const updated = await hintService.patch(hintId, body, userId);

            await auditLogService.log({
                action: "engagement.hint_update",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement_hint",
                targetId: hintId,
                payload: { fields: Object.keys(body) },
            });

            return responseHandler(res, 200, undefined, updated);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async remove(req: Request, res: Response) {
        try {
            const { id, hintId } = v<{ id: number; hintId: number }>(req, "params");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const existing = await hintService.getInEngagement(id, hintId);
            if (!existing) return responseHandler(res, 404, "Hint not found in this engagement");

            await hintService.remove(hintId);

            await auditLogService.log({
                action: "engagement.hint_delete",
                actorUserId: userId,
                engagementId: id,
                targetType: "engagement_hint",
                targetId: hintId,
                payload: { slot: existing.slot },
            });

            return responseHandler(res, 204);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const hintController = new HintController();

import type { Request, Response } from "express";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { normalizePagination } from "@/api-contract/pagination.dto";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { engagementService } from "@/lib/security/engagements/engagement.service";
import { findingService } from "@/lib/security/findings/finding.service";
import { getUserIdFromRequest } from "@/util/utils";
import type {
    FindingCommentBody,
    FindingListQuery,
    FindingPatchBody,
} from "./finding.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class FindingController {
    async list(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const q = v<FindingListQuery>(req, "query");
            const engagement = await engagementService.getById(id);
            if (!engagement) return responseHandler(res, 404, "Engagement not found");

            const p = normalizePagination(q, { defaultSort: "discoveredAt", defaultOrder: "desc", defaultLimit: 100 });
            const rows = await findingService.listForEngagement(id, {
                status: q.status,
                severity: q.severity,
                category: q.category,
                triageReason: q.triageReason,
                workerKey: q.workerKey,
                entityId: q.entityId,
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

    async get(req: Request, res: Response) {
        try {
            const { id, findingId } = v<{ id: number; findingId: number }>(req, "params");
            const finding = await findingService.getInEngagement(id, findingId);
            if (!finding) return responseHandler(res, 404, "Finding not found");
            return responseHandler(res, 200, undefined, finding);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async patch(req: Request, res: Response) {
        try {
            const { id, findingId } = v<{ id: number; findingId: number }>(req, "params");
            const body = v<FindingPatchBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const updated = await findingService.updateTriage({
                engagementId: id,
                findingId,
                status: body.status,
                triageReason: body.triageReason ?? null,
                triageNote: body.triageNote ?? null,
                resolutionNote: body.resolutionNote ?? null,
                actorUserId: userId,
            });
            if (!updated) return responseHandler(res, 404, "Finding not found");

            await auditLogService.log({
                action: "finding.triage",
                actorUserId: userId,
                engagementId: id,
                targetType: "finding",
                targetId: findingId,
                payload: {
                    status: body.status,
                    triageReason: body.triageReason ?? null,
                    hasTriageNote: !!body.triageNote,
                    hasResolutionNote: !!body.resolutionNote,
                },
            });

            return responseHandler(res, 200, undefined, { finding: updated });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async listComments(req: Request, res: Response) {
        try {
            const { id, findingId } = v<{ id: number; findingId: number }>(req, "params");
            const rows = await findingService.listComments(id, findingId);
            return responseHandler(res, 200, undefined, rows);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async createComment(req: Request, res: Response) {
        try {
            const { id, findingId } = v<{ id: number; findingId: number }>(req, "params");
            const body = v<FindingCommentBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const created = await findingService.createComment({
                engagementId: id,
                findingId,
                userId,
                body: body.body,
            });
            if (!created) return responseHandler(res, 404, "Finding not found");

            await auditLogService.log({
                action: "finding.comment_create",
                actorUserId: userId,
                engagementId: id,
                targetType: "finding",
                targetId: findingId,
                payload: { commentId: created.id },
            });

            return responseHandler(res, 201, undefined, created);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async deleteComment(req: Request, res: Response) {
        try {
            const { id, findingId, commentId } = v<{ id: number; findingId: number; commentId: number }>(req, "params");
            const userId = (await getUserIdFromRequest(req)) ?? null;

            const deleted = await findingService.deleteComment({
                engagementId: id,
                findingId,
                commentId,
            });
            if (!deleted) return responseHandler(res, 404, "Comment not found");

            await auditLogService.log({
                action: "finding.comment_delete",
                actorUserId: userId,
                engagementId: id,
                targetType: "finding",
                targetId: findingId,
                payload: { commentId },
            });

            return responseHandler(res, 204);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const findingController = new FindingController();

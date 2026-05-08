import type { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { auditLogService } from "@/lib/security/audit/audit-log.service";
import { ruleService } from "@/lib/security/rules/rule.service";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { normalizePagination } from "@/api-contract/pagination.dto";
import { getUserIdFromRequest } from "@/util/utils";
import type { RuleCreateBody, RuleListQuery, RuleUpdateBody } from "./rule.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class RuleController {
    async list(req: Request, res: Response) {
        try {
            const q = v<RuleListQuery>(req, "query");
            const p = normalizePagination(q, { defaultSort: "createdAt", defaultOrder: "desc", defaultLimit: 100 });
            const rows = await ruleService.list({
                trigger: q.trigger,
                enabled: q.enabled === undefined ? undefined : q.enabled === "true",
                scope: q.scope,
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
            const { id } = v<{ id: number }>(req, "params");
            const rule = await ruleService.getById(id);
            if (!rule) return responseHandler(res, 404, "Rule not found");
            return responseHandler(res, 200, undefined, rule);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async create(req: Request, res: Response) {
        try {
            const body = v<RuleCreateBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const rule = await ruleService.create({
                name: body.name,
                description: body.description ?? null,
                scope: body.scope,
                trigger: body.trigger,
                action: body.action,
                condition: body.condition ?? null,
                actionParams: body.actionParams,
                enabled: body.enabled,
                createdBy: userId,
            });
            await auditLogService.log({
                action: "rule.create",
                actorUserId: userId,
                targetType: "rule",
                targetId: rule.id,
                payload: { name: rule.name, trigger: rule.trigger, action: rule.action, enabled: rule.enabled },
            });
            return responseHandler(res, 201, undefined, rule);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const body = v<RuleUpdateBody>(req, "body");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const rule = await ruleService.update(id, body);
            if (!rule) return responseHandler(res, 404, "Rule not found");
            await auditLogService.log({
                action: "rule.update",
                actorUserId: userId,
                targetType: "rule",
                targetId: rule.id,
                payload: { changedKeys: Object.keys(body) },
            });
            return responseHandler(res, 200, undefined, rule);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async remove(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const userId = (await getUserIdFromRequest(req)) ?? null;
            const ok = await ruleService.delete(id);
            if (!ok) return responseHandler(res, 404, "Rule not found");
            await auditLogService.log({
                action: "rule.delete",
                actorUserId: userId,
                targetType: "rule",
                targetId: id,
                payload: {},
            });
            return responseHandler(res, 200, undefined, { ok: true });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const ruleController = new RuleController();

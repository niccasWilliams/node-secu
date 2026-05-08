// Intelligence-Controller — globale, engagement-übergreifende Sicht.
// Versorgt das "Globale Kommandozentrum"-Tab im Frontend.

import type { Request, Response } from "express";
import type { ValidatedRequest } from "@/api-contract/contract.middleware";
import { responseHandler } from "@/lib/communication";
import { intelligenceService } from "@/lib/security/intelligence/intelligence.service";
import type {
    CrossEngagementHitsQuery,
    NeighborhoodQuery,
    TechGraphQuery,
    TechUsagesQuery,
} from "./intelligence.dto";

function v<T>(req: Request, key: "params" | "query" | "body"): T {
    return ((req as ValidatedRequest).validated?.[key] ?? {}) as T;
}

class IntelligenceController {
    async neighborhood(req: Request, res: Response) {
        try {
            const { id } = v<{ id: number }>(req, "params");
            const q = v<NeighborhoodQuery>(req, "query");
            const out = await intelligenceService.neighborhood(id, {
                depth: q.depth,
                limit: q.limit,
            });
            if (!out.center) return responseHandler(res, 404, "Entity not found");
            return responseHandler(res, 200, undefined, out);
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async crossEngagementHits(req: Request, res: Response) {
        try {
            const q = v<CrossEngagementHitsQuery>(req, "query");
            const kinds = q.kinds
                ? q.kinds.split(",").map((s) => s.trim()).filter(Boolean)
                : undefined;
            const items = await intelligenceService.crossEngagementHits({ kinds, limit: q.limit });
            return responseHandler(res, 200, undefined, { items });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async techGraph(req: Request, res: Response) {
        try {
            const q = v<TechGraphQuery>(req, "query");
            const items = await intelligenceService.techGraph({
                minEngagements: q.minEngagements,
                limit: q.limit,
            });
            return responseHandler(res, 200, undefined, { items });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }

    async techUsages(req: Request, res: Response) {
        try {
            const { techName } = v<{ techName: string }>(req, "params");
            const q = v<TechUsagesQuery>(req, "query");
            const items = await intelligenceService.techUsages(techName, { limit: q.limit });
            return responseHandler(res, 200, undefined, { items });
        } catch (e: any) {
            return responseHandler(res, 500, e?.message ?? "Internal Server Error");
        }
    }
}

export const intelligenceController = new IntelligenceController();

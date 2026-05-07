import { Request, Response } from "express";
import { responseHandler } from "@/lib/communication";
import { publicScanInputSchema } from "./public-scan.dto";
import { publicScanUseCase } from "./public-scan.useCase";

export const publicScanController = {
    async runScan(req: Request, res: Response) {
        const parsed = publicScanInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return responseHandler(res, 400, { message: "invalid_input", details: parsed.error.flatten() });
        }

        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
            || req.socket.remoteAddress
            || "unknown";

        try {
            const result = await publicScanUseCase.run(parsed.data, ip);
            if (!result.ok) {
                if (result.reason === "rate_limited") {
                    res.setHeader("Retry-After", String(result.retryAfterSeconds));
                    return responseHandler(res, 429, "rate_limited_try_again_later");
                }
                return responseHandler(res, 400, "scan_rejected");
            }
            return responseHandler(res, 200, "scan_completed", result);
        } catch (err) {
            console.error("[public-scan] failed", err);
            return responseHandler(res, 500, (err as Error).message);
        }
    },
};

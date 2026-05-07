/**
 * AMP Proxy Route (Express — für Node-Backends)
 *
 * Äquivalent zum Next.js AMP-Proxy in williams.
 * Ermöglicht AMP, Daten von diesem Backend zu lesen/schreiben.
 *
 * KOPIERBAR: Diese Datei kann in jedes Node-Backend (node-bill, node-shop, node-cron)
 * kopiert werden. Nur die Handler-Imports anpassen.
 *
 * AMP ruft auf: GET/POST/PUT/DELETE /api/amp-proxy/:key
 * Auth: OAuth2 Bearer Token (wird im Controller validiert)
 */

import { Router, Request, Response } from "express";
import { logService } from "../log-service/log-service.service";

const router = Router();

// ── Auth Middleware (validiert AMP's OAuth2 Token) ──
async function validateAmpToken(req: Request, res: Response, next: Function) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }

    try {
        // Import OAuth2 Token Service dynamisch (existiert in jedem Template-Backend)
        const { oauth2TokenService } = await import("../oauth2/oauth2-token.service");
        const token = authHeader.substring(7);
        const payload = await oauth2TokenService.verifyAccessToken(token);

        if (!payload) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        next();
    } catch (error) {
        return res.status(401).json({ error: "Token validation failed" });
    }
}

// ── Discovery Endpoint (VOR Auth — wird durch x-api-key abgesichert) ──
router.get("/_discover", async (req: Request, res: Response) => {
    const apiKey = req.headers["x-api-key"] as string;
    const authBearer = req.headers.authorization?.replace("Bearer ", "");

    // Accept either x-api-key header or Bearer token matching APP_API_KEY
    const expectedKey = process.env.APP_API_KEY;
    if (expectedKey && apiKey !== expectedKey && authBearer !== expectedKey) {
        return res.status(401).json({ error: "Invalid API key for discovery" });
    }

    const { AMP_MANIFEST } = await import("./amp.manifest");
    res.json({ success: true, data: AMP_MANIFEST });
});

router.use(validateAmpToken);

// ── GET Handler ──

router.get("/:key", async (req: Request, res: Response) => {
    const { key } = req.params;

    try {
        switch (key) {
            // ── Logs ──
            case "logs": {
                const search = (req.query.search as string) || "";
                const page = Math.max(1, Number(req.query.page) || 1);
                const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
                const level = req.query.level as "error" | "info" | "warn" | "debug" | "fatal" | "critical" | undefined;
                const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
                const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

                // searchLogs ist die Standard-Methode im Template Log-Service
                const logs = await logService.searchLogs(search, page, pageSize, { level, dateFrom, dateTo });
                return res.json({ success: true, data: logs });
            }

            default:
                return res.status(404).json({ error: `Unknown proxy key: ${key}` });
        }
    } catch (error: any) {
        console.error(`[AMP Proxy] GET /${key} error:`, error.message);
        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

// ── POST Handler ──
router.post("/:key", async (req: Request, res: Response) => {
    const { key } = req.params;

    try {
        switch (key) {
            case "create-log": {
                const { level, message, context } = req.body;
                if (!level || !message) {
                    return res.status(400).json({ error: "level and message required" });
                }
                // Public log methods by level
                switch (level) {
                    case "error": await logService.error(message, context); break;
                    case "warn": await logService.warn(message, context); break;
                    case "critical": await logService.critical(message, context); break;
                    default: await logService.info(message, context);
                }
                return res.json({ success: true });
            }

            default:
                return res.status(404).json({ error: `Unknown proxy key: ${key}` });
        }
    } catch (error: any) {
        console.error(`[AMP Proxy] POST /${key} error:`, error.message);
        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

// ── DELETE Handler ──
router.delete("/:key", async (req: Request, res: Response) => {
    const { key } = req.params;

    try {
        switch (key) {
            case "delete-logs": {
                const { logIds } = req.body;
                if (!Array.isArray(logIds)) return res.status(400).json({ error: "logIds array required" });
                await logService.deleteLogs(logIds);
                return res.json({ success: true });
            }

            default:
                return res.status(404).json({ error: `Unknown proxy key: ${key}` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || "Internal Server Error" });
    }
});

export default router;

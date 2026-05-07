// Scan-Route — Tenant-protected Scan-Verwaltung (start, status, history).
// PHASE 1.5 STUB.

import express from "express";
import { responseHandler } from "@/lib/communication";

const router = express.Router();

router.get("/", (_req, res) => {
    return responseHandler(res, 501, "not_implemented_yet — see ROADMAP.md Phase 1.5");
});

router.post("/start", (_req, res) => {
    return responseHandler(res, 501, "not_implemented_yet — see ROADMAP.md Phase 1.5");
});

router.get("/:id", (_req, res) => {
    return responseHandler(res, 501, "not_implemented_yet — see ROADMAP.md Phase 1.5");
});

export default router;

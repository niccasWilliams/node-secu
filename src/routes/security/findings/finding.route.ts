// Findings-Route — Tenant-protected Listing & Status-Management.
// PHASE 1.5 STUB.

import express from "express";
import { responseHandler } from "@/lib/communication";

const router = express.Router();

router.get("/", (_req, res) => {
    return responseHandler(res, 501, "not_implemented_yet — see ROADMAP.md Phase 1.5");
});

router.patch("/:id/status", (_req, res) => {
    return responseHandler(res, 501, "not_implemented_yet — see ROADMAP.md Phase 1.5");
});

export default router;

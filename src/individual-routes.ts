// INDIVIDUAL ROUTES — Node-Secu Security-Backend
// This file is NOT synced with the template.

import express from "express";

// Public (anonymer Free-Scan, mit Rate-Limit + Consent-Pflicht)
import publicScanRouter from "./routes/security/public-scan/public-scan.route";

// Tenant-protected (PHASE 1.5: Auth-Middleware nachrüsten)
import assetRouter from "./routes/security/assets/asset.route";
import scanRouter from "./routes/security/scans/scan.route";
import findingRouter from "./routes/security/findings/finding.route";

/**
 * Register Node-Secu spezifische Routes.
 * Wird aus routes.ts NACH den Base-Routes aufgerufen.
 */
const registerIndividualRoutes = (app: express.Application) => {
    // ── Public (no auth) ──────────────────────────────────────────────
    app.use("/public", publicScanRouter);

    // ── Tenant-protected (PHASE 1.5: + auth middleware) ───────────────
    app.use("/assets", assetRouter);
    app.use("/scans", scanRouter);
    app.use("/findings", findingRouter);
};

export default registerIndividualRoutes;

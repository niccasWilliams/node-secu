// INDIVIDUAL ROUTES — Node-Secu Security-Backend
// This file is NOT synced with the template.

import express from "express";
import catalogRouter from "./routes/security/catalog/catalog.route";
import engagementRouter from "./routes/security/engagements/engagement.route";
import entityRouter from "./routes/security/entities/entity.route";
import findingRouter from "./routes/security/findings/finding.route";
import globalRouter from "./routes/security/global/global.route";
import hintRouter from "./routes/security/hints/hint.route";
import intelligenceRouter from "./routes/security/intelligence/intelligence.route";
import playbookRouter from "./routes/security/playbooks/playbook.route";
import ruleRouter from "./routes/security/rules/rule.route";
import workerRouter from "./routes/security/workers/worker.route";
import { bootstrapSecurityDomain } from "./lib/security/bootstrap";

/**
 * Register Node-Secu spezifische Routes.
 * Wird aus routes.ts NACH den Base-Routes aufgerufen.
 */
const registerIndividualRoutes = (app: express.Application) => {
    // Phase 1+2+2.5: AuthorizationResolver + Playbook-Registry + Rule-Evaluator init.
    bootstrapSecurityDomain();

    // Phase 1: Engagement & Entity CRUD + Graph + Convenience.
    app.use("/engagements", engagementRouter);
    app.use("/entities", entityRouter);

    // Phase 2: Playbook-Engine (Pfade /playbooks und /engagements/:id/playbooks/...)
    app.use("/", playbookRouter);

    // Command-Center Findings API (Pfade /engagements/:id/findings/...)
    app.use("/", findingRouter);

    // Phase 2.5: Rule-Engine.
    app.use("/rules", ruleRouter);

    // Phase 4.5: Worker-Trigger-API (Pfade /workers und /engagements/:id/workers/...)
    app.use("/", workerRouter);

    // Sprint 1 (OSINT-Engine, features.md §2.1): Operator-Hints pro Engagement.
    app.use("/", hintRouter);

    // Schema-driven UI: Enum-Werte, Playbook-/Worker-Display-Metadaten als
    // Single-Source-of-Truth fürs Frontend (Pfad /catalog/...).
    app.use("/", catalogRouter);

    // Globale Intelligence: cross-engagement Pivots, Tech-Graph,
    // k-Hop-Neighborhood (Lazy-Mindmap-Loading). Pfad /intelligence/...
    app.use("/intelligence", intelligenceRouter);

    // Cross-Engagement-Endpoints fürs FE-Intelligence-Dashboard:
    //   /graph/aggregate   /activity   /findings   /workers/runs
    app.use("/", globalRouter);
};

export default registerIndividualRoutes;

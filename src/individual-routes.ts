// INDIVIDUAL ROUTES — Node-Secu Security-Backend
// This file is NOT synced with the template.

import express from "express";
import engagementRouter from "./routes/security/engagements/engagement.route";
import entityRouter from "./routes/security/entities/entity.route";
import playbookRouter from "./routes/security/playbooks/playbook.route";
import { bootstrapSecurityDomain } from "./lib/security/bootstrap";

/**
 * Register Node-Secu spezifische Routes.
 * Wird aus routes.ts NACH den Base-Routes aufgerufen.
 */
const registerIndividualRoutes = (app: express.Application) => {
    // Phase 1+2: AuthorizationResolver + Playbook-Registry initialisieren.
    bootstrapSecurityDomain();

    // Phase 1: Engagement & Entity CRUD + Graph + Convenience.
    app.use("/engagements", engagementRouter);
    app.use("/entities", entityRouter);

    // Phase 2: Playbook-Engine (Pfade /playbooks und /engagements/:id/playbooks/...)
    app.use("/", playbookRouter);
};

export default registerIndividualRoutes;

// BASE ROUTES
// This file contains all base template routes
// DO NOT add app-specific routes here - use individual-routes.ts instead

import express from "express";

// Base route imports

import appLogRouter from "./routes/log-service/log-service.route";
import settingsRouter from "./routes/settings/settings.route";
import roleRouter from "./routes/auth/roles/roles/role.route";
import permissionRouter from "./routes/auth/roles/permissions/permission.route";
import roleAssignmentRouter from "./routes/auth/roles/role-assignments/role-assignment.route";
import userRouter from "./routes/auth/users/user/user.route";
import webhookRouter from "./routes/webhooks/webhook.route";
import appInfoRouter from "./routes/appInfo/app-info.route";
import userActivityRouter from "./routes/auth/users/activitys/user-activity.route";
import jobRouter from "./routes/jobs/job.route";
import entitlementsRouter from "./lib/entitlements/entitlement.route";
import oauthRouter from "./routes/oauth2/oauth2.route";
import ampProxyRouter from "./routes/amp-proxy/amp-proxy.route";
import directAuthRouter from "./routes/auth/direct/direct-auth.route";
import { AUTH_MODE } from "./auth/auth.config";

// Individual routes import
import registerIndividualRoutes from "./individual-routes";


const registerRoutes = (app: express.Application) => {

  // direct-auth: serverless frontends (Expo, etc.) authenticate against the backend itself.
  if (AUTH_MODE === "direct") {
    app.use("/auth", directAuthRouter);
  }

  // Base Template Routes
  app.use("/app-info", appInfoRouter);
  app.use("/settings", settingsRouter);
  app.use("/webhooks", webhookRouter);
  app.use("/app-logs", appLogRouter)
  app.use("/cron-jobs", jobRouter);

  // Auth & User Management Routes
  app.use("/users", userRouter);
  app.use("/user-activity", userActivityRouter);
  app.use("/roles", roleRouter);
  app.use("/permissions", permissionRouter);
  app.use("/role-assignments", roleAssignmentRouter);

  // OAuth2 (Client Credentials Flow)
  app.use("/oauth", oauthRouter);

  // Entitlements (Shop)
  app.use("/entitlements", entitlementsRouter);
  // Optional alias for shop setups that keep an /api prefix
  app.use("/api/entitlements", entitlementsRouter);

  // AMP Proxy (ermoeglicht AMP Log-Collection, Feature-Sync, etc.)
  app.use("/api/amp-proxy", ampProxyRouter);


  // Register individual app-specific routes
  registerIndividualRoutes(app);

};

export default registerRoutes;

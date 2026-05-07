import { Router } from "express";
import { createContractRouter } from "@/api-contract/contract-router";
import { contract, validate } from "@/api-contract/contract.middleware";
import { typeRef } from "@/api-contract/type-ref";
import { directAuthController } from "./direct-auth.controller";
import {
    emptyBodySchema,
    emptyQuerySchema,
    loginBodySchema,
    logoutBodySchema,
    pushTokenBodySchema,
    refreshBodySchema,
    registerBodySchema,
    verifyEmailConfirmBodySchema,
    verifyEmailLandingQuerySchema,
} from "./direct-auth.dto";

const c = createContractRouter("/auth", { tags: ["auth"] });
const router: Router = c.router;

c.post(
    "/register",
    validate({ body: registerBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "auth_register",
        summary: "Register a new direct-auth account",
        auth: { type: "public" },
        request: { body: registerBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 200, data: typeRef("DirectAuthResponse") }],
    }),
    directAuthController.register,
);

c.post(
    "/login",
    validate({ body: loginBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "auth_login",
        summary: "Log in with email + password",
        auth: { type: "public" },
        request: { body: loginBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 200, data: typeRef("DirectAuthResponse") }],
    }),
    directAuthController.login,
);

c.post(
    "/refresh",
    validate({ body: refreshBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "auth_refresh",
        summary: "Rotate access + refresh tokens",
        auth: { type: "public" },
        request: { body: refreshBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 200, data: typeRef("DirectAuthTokens") }],
    }),
    directAuthController.refresh,
);

c.post(
    "/logout",
    validate({ body: logoutBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "auth_logout",
        summary: "Revoke the current refresh token",
        auth: { type: "public" },
        request: { body: logoutBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 204, data: emptyBodySchema }],
    }),
    directAuthController.logout,
);

c.get(
    "/me",
    validate({ query: emptyQuerySchema }),
    contract({
        operationId: "auth_me",
        summary: "Get the current user (Bearer access JWT)",
        auth: { type: "frontend_bearer_http" },
        request: { query: emptyQuerySchema },
        responses: [{ kind: "json", status: 200, data: typeRef("DirectAuthUser") }],
    }),
    directAuthController.me,
);

c.post(
    "/push-token",
    validate({ body: pushTokenBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "auth_push_token_upsert",
        summary: "Register a device push token for the current user",
        auth: { type: "frontend_bearer_http" },
        request: { body: pushTokenBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 204, data: emptyBodySchema }],
    }),
    directAuthController.pushToken,
);

c.post(
    "/verify-email/request",
    validate({ body: emptyBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "auth_verify_email_request",
        summary: "Send a fresh email-verification link to the current user",
        auth: { type: "frontend_bearer_http" },
        request: { body: emptyBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 200, data: typeRef("DirectAuthRequestVerificationResponse") }],
    }),
    directAuthController.requestEmailVerification,
);

c.post(
    "/verify-email/confirm",
    validate({ body: verifyEmailConfirmBodySchema, bodyContentType: "application/json" }),
    contract({
        operationId: "auth_verify_email_confirm",
        summary: "Confirm an email-verification token (programmatic / deep-link flow)",
        auth: { type: "public" },
        request: { body: verifyEmailConfirmBodySchema, bodyContentType: "application/json" },
        responses: [{ kind: "json", status: 200, data: typeRef("DirectAuthVerifyEmailResponse") }],
    }),
    directAuthController.confirmEmailVerification,
);

c.get(
    "/verify-email",
    validate({ query: verifyEmailLandingQuerySchema }),
    contract({
        operationId: "auth_verify_email_landing",
        summary: "Browser landing page that consumes the verification token",
        auth: { type: "public" },
        request: { query: verifyEmailLandingQuerySchema },
        responses: [{ kind: "binary", status: 200, contentType: "text/html" }],
    }),
    directAuthController.verifyEmailLandingPage,
);

export default router;

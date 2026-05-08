// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated at: 2026-05-08T19:53:16.137Z
// Run `pnpm run api:generate` to regenerate

import type { DirectAuthRequestVerificationResponse, DirectAuthResponse, DirectAuthTokens, DirectAuthUser, DirectAuthVerifyEmailResponse } from "../../frontend-types";

export type AuthRegisterParams = undefined;
export type AuthRegisterQuery = undefined;
export type AuthRegisterBody = {
  email: string;
  password: string;
  name?: string;
};
export type AuthRegisterResponseData = DirectAuthResponse;
export type AuthRegisterResponse = import("../types").ApiEnvelope<AuthRegisterResponseData>;

export type AuthLoginParams = undefined;
export type AuthLoginQuery = undefined;
export type AuthLoginBody = {
  email: string;
  password: string;
};
export type AuthLoginResponseData = DirectAuthResponse;
export type AuthLoginResponse = import("../types").ApiEnvelope<AuthLoginResponseData>;

export type AuthRefreshParams = undefined;
export type AuthRefreshQuery = undefined;
export type AuthRefreshBody = {
  refreshToken: string;
};
export type AuthRefreshResponseData = DirectAuthTokens;
export type AuthRefreshResponse = import("../types").ApiEnvelope<AuthRefreshResponseData>;

export type AuthLogoutParams = undefined;
export type AuthLogoutQuery = undefined;
export type AuthLogoutBody = {
  refreshToken?: string;
};
export type AuthLogoutResponseData = {

};
export type AuthLogoutResponse = import("../types").ApiEnvelope<AuthLogoutResponseData>;

export type AuthMeParams = undefined;
export type AuthMeQuery = {

};
export type AuthMeBody = undefined;
export type AuthMeResponseData = DirectAuthUser;
export type AuthMeResponse = import("../types").ApiEnvelope<AuthMeResponseData>;

export type AuthPushTokenUpsertParams = undefined;
export type AuthPushTokenUpsertQuery = undefined;
export type AuthPushTokenUpsertBody = {
  token: string;
  platform: "ios" | "android" | "web" | "expo";
};
export type AuthPushTokenUpsertResponseData = {

};
export type AuthPushTokenUpsertResponse = import("../types").ApiEnvelope<AuthPushTokenUpsertResponseData>;

export type AuthVerifyEmailRequestParams = undefined;
export type AuthVerifyEmailRequestQuery = undefined;
export type AuthVerifyEmailRequestBody = {

};
export type AuthVerifyEmailRequestResponseData = DirectAuthRequestVerificationResponse;
export type AuthVerifyEmailRequestResponse = import("../types").ApiEnvelope<AuthVerifyEmailRequestResponseData>;

export type AuthVerifyEmailConfirmParams = undefined;
export type AuthVerifyEmailConfirmQuery = undefined;
export type AuthVerifyEmailConfirmBody = {
  token: string;
};
export type AuthVerifyEmailConfirmResponseData = DirectAuthVerifyEmailResponse;
export type AuthVerifyEmailConfirmResponse = import("../types").ApiEnvelope<AuthVerifyEmailConfirmResponseData>;

export type AuthVerifyEmailLandingParams = undefined;
export type AuthVerifyEmailLandingQuery = {
  token?: string;
};
export type AuthVerifyEmailLandingBody = undefined;
export type AuthVerifyEmailLandingResponseData = Blob;
export type AuthVerifyEmailLandingResponse = Blob;

export const apiRoutes_auth = {
  "auth_register": {
    method: "POST",
    path: "/auth/register",
    auth: {"type":"public"},
    meta: {
      tags: ["auth"],
      summary: "Register a new direct-auth account",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: AuthRegisterParams;
      query: AuthRegisterQuery;
      body: AuthRegisterBody;
      response: AuthRegisterResponse;
      responseData: AuthRegisterResponseData;
    },
  },
  "auth_login": {
    method: "POST",
    path: "/auth/login",
    auth: {"type":"public"},
    meta: {
      tags: ["auth"],
      summary: "Log in with email + password",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: AuthLoginParams;
      query: AuthLoginQuery;
      body: AuthLoginBody;
      response: AuthLoginResponse;
      responseData: AuthLoginResponseData;
    },
  },
  "auth_refresh": {
    method: "POST",
    path: "/auth/refresh",
    auth: {"type":"public"},
    meta: {
      tags: ["auth"],
      summary: "Rotate access + refresh tokens",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: AuthRefreshParams;
      query: AuthRefreshQuery;
      body: AuthRefreshBody;
      response: AuthRefreshResponse;
      responseData: AuthRefreshResponseData;
    },
  },
  "auth_logout": {
    method: "POST",
    path: "/auth/logout",
    auth: {"type":"public"},
    meta: {
      tags: ["auth"],
      summary: "Revoke the current refresh token",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: AuthLogoutParams;
      query: AuthLogoutQuery;
      body: AuthLogoutBody;
      response: AuthLogoutResponse;
      responseData: AuthLogoutResponseData;
    },
  },
  "auth_me": {
    method: "GET",
    path: "/auth/me",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["auth"],
      summary: "Get the current user (Bearer access JWT)",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: AuthMeParams;
      query: AuthMeQuery;
      body: AuthMeBody;
      response: AuthMeResponse;
      responseData: AuthMeResponseData;
    },
  },
  "auth_push_token_upsert": {
    method: "POST",
    path: "/auth/push-token",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["auth"],
      summary: "Register a device push token for the current user",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: AuthPushTokenUpsertParams;
      query: AuthPushTokenUpsertQuery;
      body: AuthPushTokenUpsertBody;
      response: AuthPushTokenUpsertResponse;
      responseData: AuthPushTokenUpsertResponseData;
    },
  },
  "auth_verify_email_request": {
    method: "POST",
    path: "/auth/verify-email/request",
    auth: {"type":"frontend_bearer_http"},
    meta: {
      tags: ["auth"],
      summary: "Send a fresh email-verification link to the current user",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: AuthVerifyEmailRequestParams;
      query: AuthVerifyEmailRequestQuery;
      body: AuthVerifyEmailRequestBody;
      response: AuthVerifyEmailRequestResponse;
      responseData: AuthVerifyEmailRequestResponseData;
    },
  },
  "auth_verify_email_confirm": {
    method: "POST",
    path: "/auth/verify-email/confirm",
    auth: {"type":"public"},
    meta: {
      tags: ["auth"],
      summary: "Confirm an email-verification token (programmatic / deep-link flow)",
      bodyContentType: "application/json",
      validated: {"params":false,"query":false,"body":true},
    },
    types: null as unknown as {
      params: AuthVerifyEmailConfirmParams;
      query: AuthVerifyEmailConfirmQuery;
      body: AuthVerifyEmailConfirmBody;
      response: AuthVerifyEmailConfirmResponse;
      responseData: AuthVerifyEmailConfirmResponseData;
    },
  },
  "auth_verify_email_landing": {
    method: "GET",
    path: "/auth/verify-email",
    auth: {"type":"public"},
    meta: {
      tags: ["auth"],
      summary: "Browser landing page that consumes the verification token",
      validated: {"params":false,"query":true,"body":false},
    },
    types: null as unknown as {
      params: AuthVerifyEmailLandingParams;
      query: AuthVerifyEmailLandingQuery;
      body: AuthVerifyEmailLandingBody;
      response: AuthVerifyEmailLandingResponse;
      responseData: AuthVerifyEmailLandingResponseData;
    },
  },
} as const;
import express from "express";
import request from "supertest";

jest.mock("@/routes/oauth2/oauth2.useCase", () => {
  const actual = jest.requireActual("@/routes/oauth2/oauth2.useCase");
  return {
    ...actual,
    oauth2UseCase: {
      ...actual.oauth2UseCase,
      grantClientCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeToken: jest.fn(),
    },
  };
});

import oauthRouter from "@/routes/oauth2/oauth2.route";
import { oauth2UseCase, OAuth2Error } from "@/routes/oauth2/oauth2.useCase";

function buildApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use("/oauth", oauthRouter);
  return app;
}

describe("oauth2 HTTP integration", () => {
  const mockedUseCase = oauth2UseCase as jest.Mocked<typeof oauth2UseCase>;
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST /oauth/token returns token pair and no-store headers for client_credentials", async () => {
    mockedUseCase.grantClientCredentials.mockResolvedValue({
      access_token: "access.abc",
      refresh_token: "refresh.abc",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "invoices:read",
    });

    const res = await request(app)
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "client_credentials",
        client_id: "nbill_oauth2_client",
        client_secret: "nbill_secret_x",
        scope: "invoices:read",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      access_token: "access.abc",
      refresh_token: "refresh.abc",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "invoices:read",
    });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
    expect(mockedUseCase.grantClientCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "nbill_oauth2_client",
        client_secret: "nbill_secret_x",
        scope: "invoices:read",
        metadata: expect.objectContaining({
          ipAddress: expect.any(String),
        }),
      })
    );
  });

  it("POST /oauth/token returns unsupported_grant_type for unknown grant", async () => {
    const res = await request(app)
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "password",
        client_id: "nbill_oauth2_client",
        client_secret: "nbill_secret_x",
      });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "unsupported_grant_type",
    });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
  });

  it("POST /oauth/token returns invalid_request for refresh_token without refresh token", async () => {
    const res = await request(app)
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: "nbill_oauth2_client",
        client_secret: "nbill_secret_x",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
    expect(typeof res.body.error_description).toBe("string");
    expect(res.body.success).toBeUndefined();
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
  });

  it("POST /oauth/token maps invalid_client to 401 with WWW-Authenticate header", async () => {
    mockedUseCase.grantClientCredentials.mockRejectedValue(
      new OAuth2Error("invalid_client", "Invalid client_id or client_secret")
    );

    const res = await request(app)
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "client_credentials",
        client_id: "nbill_oauth2_client",
        client_secret: "wrong",
      });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: "invalid_client",
    });
    expect(res.headers["www-authenticate"]).toContain('error="invalid_client"');
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
  });

  it("POST /oauth/revoke returns 200 and no-store headers", async () => {
    mockedUseCase.revokeToken.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/oauth/revoke")
      .type("form")
      .send({
        token: "nbill_refresh_abc",
        client_id: "nbill_oauth2_client",
        client_secret: "nbill_secret_x",
        token_type_hint: "refresh_token",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
    expect(mockedUseCase.revokeToken).toHaveBeenCalledWith({
      token: "nbill_refresh_abc",
      client_id: "nbill_oauth2_client",
      client_secret: "nbill_secret_x",
      token_type_hint: "refresh_token",
    });
  });

  it("POST /oauth/revoke returns invalid_request payload when body is incomplete", async () => {
    const res = await request(app)
      .post("/oauth/revoke")
      .type("form")
      .send({
        client_id: "nbill_oauth2_client",
        client_secret: "nbill_secret_x",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
    expect(res.body.success).toBeUndefined();
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
  });

  it("POST /oauth/revoke maps invalid_client to 401 with WWW-Authenticate header", async () => {
    mockedUseCase.revokeToken.mockRejectedValue(
      new OAuth2Error("invalid_client", "Invalid client credentials")
    );

    const res = await request(app)
      .post("/oauth/revoke")
      .type("form")
      .send({
        token: "nbill_refresh_abc",
        client_id: "nbill_oauth2_client",
        client_secret: "wrong",
      });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: "invalid_client",
    });
    expect(res.headers["www-authenticate"]).toContain('error="invalid_client"');
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
  });
});

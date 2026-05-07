import {
  requireOAuth2,
  requireScopes,
  requireOAuth2Role,
  hasOAuth2ResourceAccess,
  OAuth2AuthenticatedRequest,
} from "@/middleware/oauth2-auth.middleware";
import { oauth2TokenService } from "@/routes/oauth2/oauth2-token.service";

jest.mock("@/routes/oauth2/oauth2-token.service", () => ({
  oauth2TokenService: {
    verifyAccessToken: jest.fn(),
  },
}));

jest.mock("@/routes/oauth2/individual/oauth2-tenant.config", () => ({
  OAUTH2_TENANT_CONFIG: {
    enabled: true,
    tenantField: "managingCompanyId",
    resourceFields: [
      { field: "defaultCostCenter", type: "number" },
      { field: "availableCostCenters", type: "number[]" },
    ],
  },
}));

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
}

describe("oauth2-auth.middleware", () => {
  const mockedVerifyAccessToken = oauth2TokenService.verifyAccessToken as jest.Mock;

  beforeEach(() => {
    mockedVerifyAccessToken.mockReset();
  });

  it("requireOAuth2 rejects missing authorization header", async () => {
    const req = { headers: {} } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    await requireOAuth2(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireOAuth2 rejects malformed bearer header", async () => {
    const req = { headers: { authorization: "Token abc" } } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    await requireOAuth2(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_request" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requireOAuth2 attaches oauth2 context on valid token (with tenant fields)", async () => {
    mockedVerifyAccessToken.mockResolvedValue({
      managingCompanyId: 10,
      role: "editor",
      scopes: ["invoices:read", "invoices:write"],
      costCenters: [1, 2],
      defaultCostCenter: 1,
      sub: "client_123",
      jti: "jti_abc",
    });

    const req = { headers: { authorization: "Bearer token123" } } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    await requireOAuth2(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.oauth2).toMatchObject({
      role: "editor",
      scopes: ["invoices:read", "invoices:write"],
      clientId: "client_123",
      jti: "jti_abc",
      managingCompanyId: 10,
      defaultCostCenter: 1,
    });
  });

  it("requireOAuth2 rejects invalid token payload", async () => {
    mockedVerifyAccessToken.mockResolvedValue(null);

    const req = { headers: { authorization: "Bearer invalid-token" } } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    await requireOAuth2(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_token" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requireOAuth2 returns server_error when verifier throws", async () => {
    mockedVerifyAccessToken.mockRejectedValue(new Error("jwt backend failed"));

    const req = { headers: { authorization: "Bearer token123" } } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    await requireOAuth2(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "server_error" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requireScopes enforces all required scopes", () => {
    const middleware = requireScopes("invoices:read", "invoices:write");
    const req = {
      oauth2: {
        role: "viewer",
        scopes: ["invoices:read"],
        clientId: "c",
        jti: "j",
      },
    } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "insufficient_scope",
        scope: "invoices:read invoices:write",
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requireScopes allows request when all scopes are present", () => {
    const middleware = requireScopes("invoices:read");
    const req = {
      oauth2: {
        role: "viewer",
        scopes: ["invoices:read"],
        clientId: "c",
        jti: "j",
      },
    } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("requireScopes rejects when oauth2 context is missing", () => {
    const middleware = requireScopes("invoices:read");
    const req = {} as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "unauthorized" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("requireOAuth2Role uses hierarchy (admin bypass, viewer blocked on editor)", () => {
    const adminReq = {
      oauth2: { role: "admin", scopes: [], clientId: "c1", jti: "j1" },
    } as unknown as OAuth2AuthenticatedRequest;
    const viewerReq = {
      oauth2: { role: "viewer", scopes: [], clientId: "c2", jti: "j2" },
    } as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();
    const middleware = requireOAuth2Role("editor");

    middleware(adminReq, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    middleware(viewerReq, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("requireOAuth2Role rejects when oauth2 context is missing", () => {
    const middleware = requireOAuth2Role("viewer");
    const req = {} as unknown as OAuth2AuthenticatedRequest;
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "unauthorized" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("hasOAuth2ResourceAccess denies non-admin tokens without explicit whitelist", () => {
    const req = {
      oauth2: {
        role: "editor",
        scopes: [],
        costCenters: null,
        clientId: "c",
        jti: "j",
      },
    } as unknown as OAuth2AuthenticatedRequest;

    expect(hasOAuth2ResourceAccess(req, "costCenters", 5)).toBe(false);
    expect(hasOAuth2ResourceAccess(req, "costCenters", null)).toBe(true);
  });

  it("hasOAuth2ResourceAccess allows admin and explicit whitelist membership", () => {
    const adminReq = {
      oauth2: { role: "admin", scopes: [], costCenters: null, clientId: "c1", jti: "j1" },
    } as unknown as OAuth2AuthenticatedRequest;
    const editorReq = {
      oauth2: { role: "editor", scopes: [], costCenters: [4, 9], clientId: "c2", jti: "j2" },
    } as unknown as OAuth2AuthenticatedRequest;

    expect(hasOAuth2ResourceAccess(adminReq, "costCenters", 999)).toBe(true);
    expect(hasOAuth2ResourceAccess(editorReq, "costCenters", 9)).toBe(true);
    expect(hasOAuth2ResourceAccess(editorReq, "costCenters", 3)).toBe(false);
  });
});

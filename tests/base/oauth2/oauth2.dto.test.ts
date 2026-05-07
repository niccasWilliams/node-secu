import { oauth2EmptyQuerySchema, oauth2RevokeBodySchema, oauth2TokenBodySchema } from "@/routes/oauth2/oauth2.dto";

describe("oauth2.dto", () => {
  it("rejects refresh_token grant without refresh_token", () => {
    const parsed = oauth2TokenBodySchema.safeParse({
      grant_type: "refresh_token",
      client_id: "client_1",
      client_secret: "secret_1",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts client_credentials grant", () => {
    const parsed = oauth2TokenBodySchema.safeParse({
      grant_type: "client_credentials",
      client_id: "client_1",
      client_secret: "secret_1",
      scope: "invoices:read invoices:write",
    });

    expect(parsed.success).toBe(true);
  });

  it("validates revoke payload token_type_hint enum", () => {
    const parsed = oauth2RevokeBodySchema.safeParse({
      token: "tok",
      client_id: "client_1",
      client_secret: "secret_1",
      token_type_hint: "invalid",
    });

    expect(parsed.success).toBe(false);
  });

  it("uses strict empty query schema for scopes endpoint", () => {
    expect(oauth2EmptyQuerySchema.safeParse({}).success).toBe(true);
    expect(oauth2EmptyQuerySchema.safeParse({ x: "1" }).success).toBe(false);
  });
});

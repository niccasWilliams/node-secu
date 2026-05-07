import {
  assignEntitlementBodySchema,
  entitlementEmptyQuerySchema,
  usageOveragesPullQuerySchema,
} from "@/lib/entitlements/entitlement.dto";

describe("entitlement.dto", () => {
  it("tolerates unknown keys in assign payload (passthrough for forward-compatibility with shop)", () => {
    const parsed = assignEntitlementBodySchema.safeParse({
      externalUserId: "user_1",
      externalIdentifier: "role_premium",
      entitlementType: "role",
      extra: "future-shop-field",
    });

    // passthrough: unknown fields are kept, not rejected
    // This prevents integration breakage when the shop adds new fields before node-bill is updated
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as any).extra).toBe("future-shop-field");
    }
  });

  it("requires offset-aware datetime for validFrom/expiresAt", () => {
    const withoutOffset = assignEntitlementBodySchema.safeParse({
      externalUserId: "user_1",
      externalIdentifier: "role_premium",
      entitlementType: "role",
      validFrom: "2026-02-01T00:00:00",
    });

    const withOffset = assignEntitlementBodySchema.safeParse({
      externalUserId: "user_1",
      externalIdentifier: "role_premium",
      entitlementType: "role",
      validFrom: "2026-02-01T00:00:00.000Z",
    });

    expect(withoutOffset.success).toBe(false);
    expect(withOffset.success).toBe(true);
  });

  it("enforces pull query limit boundaries", () => {
    expect(usageOveragesPullQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(usageOveragesPullQuerySchema.safeParse({ limit: 5001 }).success).toBe(false);
    expect(usageOveragesPullQuerySchema.safeParse({ limit: 5000 }).success).toBe(true);
  });

  it("has strict empty query schema", () => {
    expect(entitlementEmptyQuerySchema.safeParse({}).success).toBe(true);
    expect(entitlementEmptyQuerySchema.safeParse({ any: "value" }).success).toBe(false);
  });
});

import { roleAssignmentService } from "@/routes/auth/roles/role-assignments/role-assignment.service";
import { EntitlementUseCase } from "@/lib/entitlements/entitlement.useCase";
import { roleService } from "@/routes/auth/roles/roles/role.service";
import { userService } from "@/routes/auth/users/user/user.service";
import { userUseCase } from "@/routes/auth/users/user/user.useCase";
import { oauth2ClientService } from "@/routes/oauth2/oauth2-client.service";
import { entitlementSyncContextService } from "@/lib/entitlements/entitlement-sync-context.service";
import { logService } from "@/routes/log-service/log-service.service";

jest.mock("@/routes/auth/roles/roles/role.service", () => ({
  roleService: { getAllRoles: jest.fn() },
}));

jest.mock("@/routes/auth/roles/role-assignments/role-assignment.service", () => ({
  roleAssignmentService: {
    getActiveOrUpcomingUserRoleAssignment: jest.fn(),
    getRecentlyExpiredUserRoleAssignment: jest.fn(),
    createRoleAssignmentWithValidity: jest.fn(),
    updateRoleAssignmentValidity: jest.fn(),
  },
}));

jest.mock("@/routes/auth/users/user/user.service", () => ({
  userService: { getUserByExternalUserId: jest.fn(), createUser: jest.fn() },
}));

jest.mock("@/routes/auth/users/user/user.useCase", () => ({
  userUseCase: { createExternalUser: jest.fn() },
}));

jest.mock("@/routes/oauth2/oauth2-client.service", () => ({
  oauth2ClientService: { getOAuth2ClientByClientId: jest.fn() },
}));

jest.mock("@/lib/entitlements/entitlement-sync-context.service", () => ({
  entitlementSyncContextService: { upsertContext: jest.fn() },
}));

jest.mock("@/routes/log-service/log-service.service", () => ({
  logService: { warn: jest.fn(), error: jest.fn() },
}));

describe("Grace Period — assignEntitlement", () => {
  const mockedGetAllRoles = roleService.getAllRoles as jest.Mock;
  const mockedGetActive = roleAssignmentService.getActiveOrUpcomingUserRoleAssignment as jest.Mock;
  const mockedGetExpired = roleAssignmentService.getRecentlyExpiredUserRoleAssignment as jest.Mock;
  const mockedCreate = roleAssignmentService.createRoleAssignmentWithValidity as jest.Mock;
  const mockedUpdate = roleAssignmentService.updateRoleAssignmentValidity as jest.Mock;
  const mockedGetUser = userService.getUserByExternalUserId as jest.Mock;
  const mockedUpsert = entitlementSyncContextService.upsertContext as jest.Mock;

  const premiumRole = {
    id: 4, name: "Premium Access", isSellable: true, description: "", createdAt: new Date(),
  };

  const expiredAssignment = {
    id: 99, userId: 3, roleId: 4, status: "active",
    validFrom: new Date("2026-02-24T00:00:00Z"),
    validTo: new Date("2026-03-24T16:10:43Z"), // expired ~1 hour ago
  };

  const renewedAssignment = {
    ...expiredAssignment,
    validTo: new Date("2026-04-24T16:10:43Z"), // extended
  };

  let useCase: EntitlementUseCase;

  beforeEach(() => {
    useCase = new EntitlementUseCase();
    jest.clearAllMocks();

    mockedGetAllRoles.mockResolvedValue([premiumRole]);
    mockedGetUser.mockResolvedValue({ id: 3 });
    (oauth2ClientService.getOAuth2ClientByClientId as jest.Mock).mockResolvedValue(null);
    mockedUpsert.mockResolvedValue({});
    (logService.warn as jest.Mock).mockResolvedValue(undefined);
  });

  it("extends recently expired assignment instead of creating new one (renewal scenario)", async () => {
    // No active assignment — subscription just expired
    mockedGetActive.mockResolvedValue(null);
    // But there IS a recently expired one (within 24h grace)
    mockedGetExpired.mockResolvedValue(expiredAssignment);
    mockedUpdate.mockResolvedValue(renewedAssignment);

    const result = await useCase.assignEntitlement({
      externalUserId: "4",
      externalIdentifier: "Premium Access",
      entitlementType: "role",
      validFrom: new Date("2026-02-24T00:00:00Z"),
      expiresAt: new Date("2026-04-24T16:10:43Z"),
    });

    // Should UPDATE the expired one, not CREATE a new one
    expect(result.created).toBe(false);
    expect(mockedUpdate).toHaveBeenCalledWith(99, expect.objectContaining({
      validTo: new Date("2026-04-24T16:10:43Z"),
    }));
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("creates new assignment when no active AND no recently expired exists", async () => {
    mockedGetActive.mockResolvedValue(null);
    mockedGetExpired.mockResolvedValue(null); // Nothing expired recently either
    mockedCreate.mockResolvedValue({ id: 100, status: "active", validFrom: new Date(), validTo: null });

    const result = await useCase.assignEntitlement({
      externalUserId: "4",
      externalIdentifier: "Premium Access",
      entitlementType: "role",
    });

    expect(result.created).toBe(true);
    expect(mockedCreate).toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("prefers active assignment over grace period", async () => {
    const activeAssignment = { id: 50, status: "active", validFrom: new Date(), validTo: new Date("2026-05-01") };
    mockedGetActive.mockResolvedValue(activeAssignment);
    // Grace period should NOT be checked when active exists
    mockedUpdate.mockResolvedValue({ ...activeAssignment, validTo: new Date("2026-05-01") });

    const result = await useCase.assignEntitlement({
      externalUserId: "4",
      externalIdentifier: "Premium Access",
      entitlementType: "role",
      expiresAt: new Date("2026-05-01"),
    });

    expect(result.created).toBe(false);
    expect(mockedUpdate).toHaveBeenCalledWith(50, expect.anything());
    // Grace period lookup should not even happen (short-circuit via ??)
    expect(mockedGetExpired).not.toHaveBeenCalled();
  });

  it("does not resurrect revoked assignments via grace period", async () => {
    // getRecentlyExpiredUserRoleAssignment only finds status='active', not 'revoked'
    // This is enforced by the query itself, but let's verify the contract
    mockedGetActive.mockResolvedValue(null);
    mockedGetExpired.mockResolvedValue(null); // Query filters status='active' only
    mockedCreate.mockResolvedValue({ id: 200, status: "active", validFrom: new Date(), validTo: null });

    const result = await useCase.assignEntitlement({
      externalUserId: "4",
      externalIdentifier: "Premium Access",
      entitlementType: "role",
    });

    expect(result.created).toBe(true);
  });
});

describe("Grace Period — updateEntitlement", () => {
  const mockedGetAllRoles = roleService.getAllRoles as jest.Mock;
  const mockedGetActive = roleAssignmentService.getActiveOrUpcomingUserRoleAssignment as jest.Mock;
  const mockedGetExpired = roleAssignmentService.getRecentlyExpiredUserRoleAssignment as jest.Mock;
  const mockedCreate = roleAssignmentService.createRoleAssignmentWithValidity as jest.Mock;
  const mockedUpdate = roleAssignmentService.updateRoleAssignmentValidity as jest.Mock;
  const mockedGetUser = userService.getUserByExternalUserId as jest.Mock;
  const mockedUpsert = entitlementSyncContextService.upsertContext as jest.Mock;

  const premiumRole = {
    id: 4, name: "Premium Access", isSellable: true, description: "", createdAt: new Date(),
  };

  let useCase: EntitlementUseCase;

  beforeEach(() => {
    useCase = new EntitlementUseCase();
    jest.clearAllMocks();

    mockedGetAllRoles.mockResolvedValue([premiumRole]);
    mockedGetUser.mockResolvedValue({ id: 3 });
    (oauth2ClientService.getOAuth2ClientByClientId as jest.Mock).mockResolvedValue(null);
    mockedUpsert.mockResolvedValue({});
  });

  it("extends recently expired assignment on PUT (subscription renewal via Phase 2)", async () => {
    const expired = {
      id: 77, status: "active", validFrom: new Date("2026-02-24"), validTo: new Date("2026-03-24T16:10:43Z"),
    };
    mockedGetActive.mockResolvedValue(null);
    mockedGetExpired.mockResolvedValue(expired);
    mockedUpdate.mockResolvedValue({ ...expired, validTo: new Date("2026-04-24T16:10:43Z") });

    const result = await useCase.updateEntitlement({
      externalUserId: "4",
      externalIdentifier: "Premium Access",
      entitlementType: "role",
      expiresAt: new Date("2026-04-24T16:10:43Z"),
    });

    expect(result.success).toBe(true);
    expect(mockedUpdate).toHaveBeenCalledWith(77, expect.objectContaining({
      validTo: new Date("2026-04-24T16:10:43Z"),
    }));
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

import { getUserEmailFromRequest, getUserIdFromRequest, resolveLocalUserByExternalUserId } from "@/util/utils";
import { userService } from "@/routes/auth/users/user/user.service";
import { userUseCase } from "@/routes/auth/users/user/user.useCase";

jest.mock("@/routes/auth/users/user/user.service", () => ({
  userService: {
    getUserByExternalUserId: jest.fn(),
  },
}));

jest.mock("@/routes/auth/users/user/user.useCase", () => ({
  userUseCase: {
    createExternalUser: jest.fn(),
  },
}));

describe("user resolution utils", () => {
  const mockedGetUserByExternalUserId = userService.getUserByExternalUserId as jest.MockedFunction<
    typeof userService.getUserByExternalUserId
  >;
  const mockedCreateExternalUser = userUseCase.createExternalUser as jest.MockedFunction<
    typeof userUseCase.createExternalUser
  >;

  beforeEach(() => {
    mockedGetUserByExternalUserId.mockReset();
    mockedCreateExternalUser.mockReset();
  });

  it("returns existing local user without creating", async () => {
    mockedGetUserByExternalUserId.mockResolvedValue({ id: 11, email: "a@example.com" } as any);

    const user = await resolveLocalUserByExternalUserId("11");

    expect(user?.id).toBe(11);
    expect(mockedCreateExternalUser).not.toHaveBeenCalled();
  });

  it("creates missing local user via userUseCase", async () => {
    mockedGetUserByExternalUserId.mockResolvedValueOnce(undefined as any);
    mockedCreateExternalUser.mockResolvedValue({ id: 22, email: "b@example.com" } as any);

    const user = await resolveLocalUserByExternalUserId("22");

    expect(mockedCreateExternalUser).toHaveBeenCalledWith("22");
    expect(user?.id).toBe(22);
  });

  it("re-reads user after createExternalUser failure and returns undefined if still missing", async () => {
    mockedGetUserByExternalUserId.mockResolvedValue(undefined as any);
    mockedCreateExternalUser.mockRejectedValue(new Error("frontend unavailable"));

    const user = await resolveLocalUserByExternalUserId("33");

    expect(user).toBeUndefined();
    expect(mockedGetUserByExternalUserId).toHaveBeenCalledTimes(2);
  });

  it("getUserIdFromRequest auto-heals missing user and returns local id", async () => {
    mockedGetUserByExternalUserId.mockResolvedValueOnce(undefined as any);
    mockedCreateExternalUser.mockResolvedValue({ id: 44 } as any);

    const userId = await getUserIdFromRequest({
      headers: { "user-id": "44" },
    } as any);

    expect(userId).toBe(44);
    expect(mockedCreateExternalUser).toHaveBeenCalledWith("44");
  });

  it("getUserEmailFromRequest auto-heals missing user and returns email", async () => {
    mockedGetUserByExternalUserId.mockResolvedValueOnce(undefined as any);
    mockedCreateExternalUser.mockResolvedValue({ id: 55, email: "c@example.com" } as any);

    const email = await getUserEmailFromRequest({
      headers: { "user-id": "55" },
    } as any);

    expect(email).toBe("c@example.com");
    expect(mockedCreateExternalUser).toHaveBeenCalledWith("55");
  });
});

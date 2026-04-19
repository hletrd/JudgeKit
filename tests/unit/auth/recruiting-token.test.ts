import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  redeemRecruitingToken: vi.fn<
    (token: string, ip?: string, accountPassword?: string) => Promise<{ ok: boolean; userId?: string; assignmentId?: string; groupId?: string; alreadyRedeemed?: boolean; error?: string }>
  >(),
  dbQueryUsersFindFirst: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  extractClientIp: vi.fn<(headers: Headers) => string | null>(),
}));

vi.mock("@/lib/assignments/recruiting-invitations", () => ({
  redeemRecruitingToken: mocks.redeemRecruitingToken,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: mocks.dbQueryUsersFindFirst,
      },
    },
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "users.id",
  },
}));

vi.mock("@/lib/security/ip", () => ({
  extractClientIp: mocks.extractClientIp,
}));

import { authorizeRecruitingToken } from "@/lib/auth/recruiting-token";

// ---------------------------------------------------------------------------
// authorizeRecruitingToken
// ---------------------------------------------------------------------------

describe("authorizeRecruitingToken", () => {
  const validToken = "abc123token";
  const mockUserId = "user-recruit-001";

  function mockRequest(overrides: Record<string, string> = {}) {
    const headers = new Headers({
      "user-agent": "TestBrowser/1.0",
      "x-forwarded-for": "10.0.0.1",
      ...overrides,
    });
    return new Request("http://localhost/api/recruit/auth", {
      method: "POST",
      headers,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractClientIp.mockReturnValue("10.0.0.1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when token redemption fails", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: false,
      error: "invalidToken",
    });

    const result = await authorizeRecruitingToken(validToken, undefined, mockRequest());

    expect(result).toBeNull();
    expect(mocks.dbQueryUsersFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when token redemption fails with tokenRevoked error", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: false,
      error: "tokenRevoked",
    });

    const result = await authorizeRecruitingToken(validToken, undefined, mockRequest());

    expect(result).toBeNull();
  });

  it("returns null when token redemption fails with tokenExpired error", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: false,
      error: "tokenExpired",
    });

    const result = await authorizeRecruitingToken(validToken, undefined, mockRequest());

    expect(result).toBeNull();
  });


  it("passes a provided resume code through to redeemRecruitingToken", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: "user-1",
      assignmentId: "assignment-1",
      groupId: "group-1",
      alreadyRedeemed: true,
    });
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce({
      id: "user-1",
      username: "recruit_resume",
      email: null,
      name: "Resume Candidate",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    });

    await authorizeRecruitingToken(validToken, undefined, mockRequest());

    expect(mocks.redeemRecruitingToken).toHaveBeenCalledWith(validToken, "10.0.0.1", undefined);
  });


  it("passes a provided account password through to redeemRecruitingToken", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: "user-2",
      assignmentId: "assignment-1",
      groupId: "group-1",
      alreadyRedeemed: false,
    });
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce({
      id: "user-2",
      username: "recruit_account",
      email: "candidate@example.com",
      name: "Password Candidate",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    });

    await authorizeRecruitingToken(validToken, "account-password", mockRequest());

    expect(mocks.redeemRecruitingToken).toHaveBeenCalledWith(validToken, "10.0.0.1", "account-password");
  });

  it("returns null when a claimed invite token is replayed", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: false,
      error: "alreadyRedeemed",
    });

    const result = await authorizeRecruitingToken(validToken, undefined, mockRequest());

    expect(result).toBeNull();
    expect(mocks.dbQueryUsersFindFirst).not.toHaveBeenCalled();
  });

  it("returns null when user is not found in database", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(undefined);

    const result = await authorizeRecruitingToken(validToken, undefined, mockRequest());

    expect(result).toBeNull();
  });

  it("returns null when user is inactive", async () => {
    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce({
      id: mockUserId,
      username: "recruit_abc",
      email: null,
      name: "Candidate",
      className: null,
      role: "student",
      isActive: false,
      mustChangePassword: true,
    });

    const result = await authorizeRecruitingToken(validToken, undefined, mockRequest());

    expect(result).toBeNull();
  });

  it("returns authenticated user with loginEventContext on success", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_abc",
      email: "candidate@example.com",
      name: "Test Candidate",
      className: "CS101",
      role: "student",
      isActive: true,
      mustChangePassword: true,
      preferredLanguage: "en",
      preferredTheme: "dark",
      editorTheme: "monokai",
      editorFontSize: "14",
      editorFontFamily: "monospace",
      lectureMode: null,
      lectureFontScale: null,
      lectureColorScheme: null,
    };

    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);

    const request = mockRequest();
    const result = await authorizeRecruitingToken(validToken, undefined, request);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(mockUserId);
    expect(result!.username).toBe("recruit_abc");
    expect(result!.email).toBe("candidate@example.com");
    expect(result!.name).toBe("Test Candidate");
    expect(result!.className).toBe("CS101");
    expect(result!.role).toBe("student");
    expect(result!.mustChangePassword).toBe(false);
    expect(result!.preferredLanguage).toBe("en");
    expect(result!.preferredTheme).toBe("dark");
  });

  it("includes loginEventContext with correct fields on success", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_xyz",
      email: null,
      name: "Recruit",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    };

    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);
    mocks.extractClientIp.mockReturnValue("192.168.1.50");

    const request = mockRequest({
      "user-agent": "Mozilla/5.0 TestAgent",
    });

    const result = await authorizeRecruitingToken(validToken, undefined, request);

    expect(result).not.toBeNull();
    expect(result!.loginEventContext).toBeDefined();
    expect(result!.loginEventContext!.ipAddress).toBe("192.168.1.50");
    expect(result!.loginEventContext!.userAgent).toBe("Mozilla/5.0 TestAgent");
    expect(result!.loginEventContext!.requestMethod).toBe("POST");
    expect(result!.loginEventContext!.requestPath).toBe("/api/recruit/auth");
    // attemptedIdentifier should start with "recruit:" prefix
    expect(result!.loginEventContext!.attemptedIdentifier).toMatch(/^recruit:[a-f0-9]{8}$/);
  });

  it("extracts client IP from request headers", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_ip",
      email: null,
      name: "IP Test",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    };

    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);
    mocks.extractClientIp.mockReturnValue("203.0.113.42");

    const request = mockRequest();
    await authorizeRecruitingToken(validToken, undefined, request);

    expect(mocks.extractClientIp).toHaveBeenCalledWith(request.headers);
  });

  it("passes IP address to redeemRecruitingToken", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_ip2",
      email: null,
      name: "IP Pass Test",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    };

    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);
    mocks.extractClientIp.mockReturnValue("198.51.100.10");

    const request = mockRequest();
    await authorizeRecruitingToken(validToken, undefined, request);

    expect(mocks.redeemRecruitingToken).toHaveBeenCalledWith(validToken, "198.51.100.10", undefined);
  });

  it("handles null IP address gracefully by passing undefined to redeem", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_nullip",
      email: null,
      name: "Null IP Test",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    };

    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);
    mocks.extractClientIp.mockReturnValue(null);

    const request = mockRequest();
    await authorizeRecruitingToken(validToken, undefined, request);

    expect(mocks.redeemRecruitingToken).toHaveBeenCalledWith(validToken, undefined, undefined);
  });

  it("produces consistent token fingerprint (sha256 truncated to 8 hex chars)", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_fp",
      email: null,
      name: "Fingerprint Test",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    };

    mocks.redeemRecruitingToken.mockResolvedValue({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValue(mockUser);

    const request = mockRequest();

    const result1 = await authorizeRecruitingToken("consistent-token-value", undefined, request);
    const result2 = await authorizeRecruitingToken("consistent-token-value", undefined, request);

    expect(result1!.loginEventContext!.attemptedIdentifier).toBe(
      result2!.loginEventContext!.attemptedIdentifier
    );
  });

  it("produces different fingerprints for different tokens", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_diff",
      email: null,
      name: "Diff FP Test",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    };

    mocks.redeemRecruitingToken.mockResolvedValue({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValue(mockUser);

    const request = mockRequest();

    const result1 = await authorizeRecruitingToken("token-alpha", undefined, request);
    const result2 = await authorizeRecruitingToken("token-beta", undefined, request);

    expect(result1!.loginEventContext!.attemptedIdentifier).not.toBe(
      result2!.loginEventContext!.attemptedIdentifier
    );
  });

  it("handles missing user-agent header gracefully", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_no_ua",
      email: null,
      name: "No UA Test",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: false,
    };

    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);
    mocks.extractClientIp.mockReturnValue("10.0.0.1");

    const headers = new Headers();
    headers.set("x-forwarded-for", "10.0.0.1");
    const request = new Request("http://localhost/api/recruit/auth", {
      method: "POST",
      headers,
    });

    const result = await authorizeRecruitingToken(validToken, undefined, request);

    expect(result).not.toBeNull();
    expect(result!.loginEventContext!.userAgent).toBeNull();
  });

  it("reads mustChangePassword from the DB user record", async () => {
    const mockUser = {
      id: mockUserId,
      username: "recruit_mcp",
      email: null,
      name: "MCP Test",
      className: null,
      role: "student",
      isActive: true,
      mustChangePassword: true, // This is true in the DB record
    };

    mocks.redeemRecruitingToken.mockResolvedValueOnce({
      ok: true,
      userId: mockUserId,
    } as any);
    mocks.dbQueryUsersFindFirst.mockResolvedValueOnce(mockUser);

    const request = mockRequest();
    const result = await authorizeRecruitingToken(validToken, undefined, request);

    expect(result).not.toBeNull();
    // After refactoring to use mapUserToAuthFields, mustChangePassword is read
    // from the DB user object instead of being hardcoded to false.
    expect(result!.mustChangePassword).toBe(true);
  });
});

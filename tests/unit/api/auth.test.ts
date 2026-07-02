import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authenticateApiKeyMock,
  getTokenMock,
  getValidatedAuthSecretMock,
  shouldUseSecureAuthCookieMock,
} = vi.hoisted(() => ({
  authenticateApiKeyMock: vi.fn(),
  getTokenMock: vi.fn(),
  getValidatedAuthSecretMock: vi.fn(() => "test-secret"),
  shouldUseSecureAuthCookieMock: vi.fn(() => false),
}));

vi.mock("@/lib/api/api-key-auth", () => ({
  authenticateApiKey: authenticateApiKeyMock,
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@/lib/security/env", () => ({
  getValidatedAuthSecret: getValidatedAuthSecretMock,
}));

vi.mock("@/lib/auth/secure-cookie", () => ({
  shouldUseSecureAuthCookie: shouldUseSecureAuthCookieMock,
}));

import { getApiUser } from "@/lib/api/auth";

describe("getApiUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenMock.mockResolvedValue(null);
  });

  it("returns the API key user and skips JWT lookup when Bearer key is valid", async () => {
    const apiUser = {
      id: "user-api",
      role: "admin",
      username: "api-user",
      email: "api@example.com",
      name: "API User",
      className: null,
      mustChangePassword: false,
      _apiKeyAuth: true as const,
    };
    authenticateApiKeyMock.mockResolvedValue(apiUser);

    const req = new NextRequest("http://localhost:3000/api/test", {
      headers: { authorization: "Bearer jk_1234567890abcdef" },
    });

    const result = await getApiUser(req);

    expect(result).toBe(apiUser);
    expect(authenticateApiKeyMock).toHaveBeenCalledOnce();
    expect(authenticateApiKeyMock).toHaveBeenCalledWith("Bearer jk_1234567890abcdef");
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("caches a failed Bearer jk_ key so it is not re-evaluated after JWT extraction", async () => {
    authenticateApiKeyMock.mockResolvedValue(null);

    const authHeader = "Bearer jk_invalidtoken";
    const req = new NextRequest("http://localhost:3000/api/test", {
      headers: { authorization: authHeader },
    });

    const result = await getApiUser(req);

    expect(result).toBeNull();
    expect(authenticateApiKeyMock).toHaveBeenCalledOnce();
    expect(authenticateApiKeyMock).toHaveBeenCalledWith(authHeader);
  });

  it("falls back to authenticateApiKey when no Bearer jk_ prefix is present", async () => {
    authenticateApiKeyMock.mockResolvedValue(null);

    const authHeader = "Bearer some-other-token";
    const req = new NextRequest("http://localhost:3000/api/test", {
      headers: { authorization: authHeader },
    });

    const result = await getApiUser(req);

    expect(result).toBeNull();
    expect(authenticateApiKeyMock).toHaveBeenCalledOnce();
    expect(authenticateApiKeyMock).toHaveBeenCalledWith(authHeader);
  });
});

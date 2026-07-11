import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createPkceChallenge } from "@/lib/oidc/protocol";

const {
  activeUserMock,
  findCodeMock,
  consumeCodeMock,
  createTokensMock,
  consumeRateLimitMock,
  clearRateLimitMock,
} = vi.hoisted(() => ({
  activeUserMock: vi.fn(),
  findCodeMock: vi.fn(),
  consumeCodeMock: vi.fn(),
  createTokensMock: vi.fn(),
  consumeRateLimitMock: vi.fn(),
  clearRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ getActiveAuthUserById: activeUserMock }));
vi.mock("@/lib/db-time", () => ({ getDbNowUncached: () => new Date("2026-07-10T12:00:00Z") }));
vi.mock("@/lib/oidc/authorization-code-store", () => ({
  findAuthorizationCode: findCodeMock,
  consumeAuthorizationCode: consumeCodeMock,
}));
vi.mock("@/lib/oidc/config", () => ({
  isOidcEnabled: () => true,
  getOidcClient: () => ({
    id: "info-course-portal",
    secret: "s".repeat(32),
    redirectUris: ["https://info.auraedu.me/api/auth/callback/judgekit"],
  }),
}));
vi.mock("@/lib/oidc/tokens", () => ({ createOidcTokenResponse: createTokensMock }));
vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: () => "oidc-token:127.0.0.1",
  consumeRateLimitAttemptMulti: consumeRateLimitMock,
  clearRateLimitMulti: clearRateLimitMock,
}));

import { POST } from "@/app/api/oidc/token/route";

const verifier = "a".repeat(43);
const redirectUri = "https://info.auraedu.me/api/auth/callback/judgekit";

function tokenRequest(secret = "s".repeat(32)) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: "authorization-code",
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  return new NextRequest("https://oj.auraedu.me/api/oidc/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`info-course-portal:${secret}`).toString("base64")}`,
    },
    body,
  });
}

describe("POST /api/oidc/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimitMock.mockResolvedValue(false);
    consumeCodeMock.mockResolvedValue(true);
    findCodeMock.mockResolvedValue({
      id: "stored-code-1",
      clientId: "info-course-portal",
      userId: "user-1",
      redirectUri,
      scope: "openid profile email",
      codeChallenge: createPkceChallenge(verifier),
      nonce: "nonce-1",
      expiresAt: new Date("2026-07-10T12:05:00Z"),
      consumedAt: null,
    });
    activeUserMock.mockResolvedValue({
      id: "user-1",
      username: "sion",
      name: "시온",
      email: "sion@example.com",
      role: "student",
      className: "1반",
      mustChangePassword: false,
    });
    createTokensMock.mockResolvedValue({
      access_token: "access-token",
      token_type: "Bearer",
      expires_in: 600,
      id_token: "id-token",
      scope: "openid profile email",
    });
  });

  it("rejects invalid client credentials without reading an authorization code", async () => {
    const response = await POST(tokenRequest("wrong-secret-that-is-long-enough"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_client" });
    expect(findCodeMock).not.toHaveBeenCalled();
  });

  it("atomically consumes a valid PKCE code and returns no-store tokens", async () => {
    const response = await POST(tokenRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ access_token: "access-token", id_token: "id-token" });
    expect(consumeCodeMock).toHaveBeenCalledWith("stored-code-1", new Date("2026-07-10T12:00:00Z"));
    expect(clearRateLimitMock).toHaveBeenCalledOnce();
  });

  it("rejects a replayed authorization code", async () => {
    consumeCodeMock.mockResolvedValue(false);
    const response = await POST(tokenRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    expect(createTokensMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createPkceChallenge } from "@/lib/oidc/protocol";

const { authMock, findSessionUserMock, issueCodeMock, recordAuditMock, dbNowMock, rateLimitMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findSessionUserMock: vi.fn(),
  issueCodeMock: vi.fn(),
  recordAuditMock: vi.fn(),
  dbNowMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/auth/find-session-user", () => ({ findSessionUser: findSessionUserMock }));
vi.mock("@/lib/oidc/authorization-code-store", () => ({ issueAuthorizationCode: issueCodeMock }));
vi.mock("@/lib/audit/events", () => ({ recordAuditEvent: recordAuditMock }));
vi.mock("@/lib/db-time", () => ({ getDbNowUncached: dbNowMock }));
vi.mock("@/lib/security/api-rate-limit", () => ({ consumeUserApiRateLimit: rateLimitMock }));
vi.mock("@/lib/oidc/config", () => ({
  isOidcEnabled: () => true,
  getOidcClient: () => ({
    id: "info-course-portal",
    secret: "s".repeat(32),
    redirectUris: ["https://info.auraedu.me/api/auth/callback/judgekit"],
  }),
}));

import { GET } from "@/app/api/oidc/authorize/route";

const verifier = "a".repeat(43);
function request(overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({
    client_id: "info-course-portal",
    redirect_uri: "https://info.auraedu.me/api/auth/callback/judgekit",
    response_type: "code",
    scope: "openid profile email",
    state: "state-1",
    code_challenge: createPkceChallenge(verifier),
    code_challenge_method: "S256",
    ...overrides,
  });
  return new NextRequest(`https://oj.auraedu.me/api/oidc/authorize?${params}`);
}

describe("GET /api/oidc/authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbNowMock.mockResolvedValue(new Date("2026-07-10T12:00:00Z"));
    issueCodeMock.mockResolvedValue("issued-code");
    rateLimitMock.mockResolvedValue(null);
  });

  it("rate-limits code issuance per user without touching the code store", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    findSessionUserMock.mockResolvedValue({ id: "user-1", role: "student", isActive: true, mustChangePassword: false });
    const { NextResponse } = await import("next/server");
    rateLimitMock.mockResolvedValue(NextResponse.json({ error: "rateLimited" }, { status: 429 }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), "user-1", "oidc:authorize");
    expect(issueCodeMock).not.toHaveBeenCalled();
  });

  it("refuses an unregistered redirect locally", async () => {
    const response = await GET(request({ redirect_uri: "https://attacker.example/callback" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("sends an unauthenticated user to JudgeKit login with an internal callback", async () => {
    authMock.mockResolvedValue(null);
    const response = await GET(request());
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toContain("/api/oidc/authorize?");
    expect(location.searchParams.get("callbackUrl")).not.toContain("https://info.auraedu.me");
  });

  it("issues a code to an active user and preserves state", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    findSessionUserMock.mockResolvedValue({
      id: "user-1",
      role: "student",
      isActive: true,
      mustChangePassword: false,
    });
    const response = await GET(request());
    const location = new URL(response.headers.get("location")!);

    expect(location.origin + location.pathname).toBe("https://info.auraedu.me/api/auth/callback/judgekit");
    expect(location.searchParams.get("code")).toBe("issued-code");
    expect(location.searchParams.get("state")).toBe("state-1");
    expect(issueCodeMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
    expect(recordAuditMock).toHaveBeenCalledOnce();
  });
});

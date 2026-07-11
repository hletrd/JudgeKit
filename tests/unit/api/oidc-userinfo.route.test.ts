import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { verifyTokenMock, activeUserMock } = vi.hoisted(() => ({
  verifyTokenMock: vi.fn(),
  activeUserMock: vi.fn(),
}));

vi.mock("@/lib/oidc/config", () => ({ isOidcEnabled: () => true }));
vi.mock("@/lib/oidc/tokens", () => ({ verifyOidcAccessToken: verifyTokenMock }));
vi.mock("@/lib/api/auth", () => ({ getActiveAuthUserById: activeUserMock }));

import { GET } from "@/app/api/oidc/userinfo/route";

describe("GET /api/oidc/userinfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyTokenMock.mockResolvedValue({ sub: "user-1", iat: 1_783_686_000, scope: "openid profile email" });
    activeUserMock.mockResolvedValue({
      id: "user-1",
      username: "sion",
      name: "시온",
      email: "sion@example.com",
      role: "student",
      className: "1반",
      mustChangePassword: false,
    });
  });

  it("returns claims allowed by the granted scopes", async () => {
    const response = await GET(new NextRequest("https://oj.auraedu.me/api/oidc/userinfo", {
      headers: { authorization: "Bearer access-token" },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sub: "user-1",
      preferred_username: "sion",
      name: "시온",
      email: "sion@example.com",
      role: "student",
      class_name: "1반",
    });
    expect(activeUserMock).toHaveBeenCalledWith("user-1", 1_783_686_000);
  });

  it("rejects a missing bearer token", async () => {
    const response = await GET(new NextRequest("https://oj.auraedu.me/api/oidc/userinfo"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });
});

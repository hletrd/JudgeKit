import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { dbSelectMock, consumeApiRateLimitMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

// Headers that satisfy the CSRF check (X-Requested-With required for POST)
const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

describe("POST /api/v1/recruiting/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockResolvedValue(null);

    dbSelectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: "invite-1",
                  status: "pending",
                  candidateName: "Candidate One",
                  expiresAt: new Date("2026-05-01T00:00:00.000Z"),
                  assignmentId: "assignment-1",
                  userId: "user-1",
                },
              ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  title: "Hidden Contest",
                  examDurationMinutes: 90,
                  deadline: new Date("2026-05-02T00:00:00.000Z"),
                },
              ]),
          }),
        }),
      });
  });

  it("returns only minimal validity metadata for valid invitations", async () => {
    const { POST } = await import("@/app/api/v1/recruiting/validate/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/recruiting/validate", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ token: "token-1" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        valid: true,
      },
    });
  });

  it("returns the same { valid: false } shape for revoked invitations", async () => {
    dbSelectMock.mockReset();
    dbSelectMock
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  status: "revoked",
                  expiresAt: new Date("2026-05-01T00:00:00.000Z"),
                  assignmentId: "assignment-1",
                },
              ]),
          }),
        }),
      });

    const { POST } = await import("@/app/api/v1/recruiting/validate/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/recruiting/validate", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ token: "token-1" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        valid: false,
      },
    });
  });

  it("returns 400 for structurally invalid token payloads", async () => {
    const { POST } = await import("@/app/api/v1/recruiting/validate/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/recruiting/validate", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ token: "" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalidToken" });
  });

  it("returns the authoritative rate-limit response before touching the database", async () => {
    consumeApiRateLimitMock.mockResolvedValueOnce(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );

    const { POST } = await import("@/app/api/v1/recruiting/validate/route");
    const response = await POST(
      new NextRequest("http://localhost/api/v1/recruiting/validate", {
        method: "POST",
        headers: CSRF_HEADERS,
        body: JSON.stringify({ token: "token-1" }),
      })
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "rateLimited" });
    expect(dbSelectMock).not.toHaveBeenCalled();
  });
});

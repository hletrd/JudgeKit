import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { dbSelectMock, consumeInMemoryRateLimitMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  consumeInMemoryRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/security/in-memory-rate-limit", () => ({
  consumeInMemoryRateLimit: consumeInMemoryRateLimitMock,
}));

vi.mock("@/lib/security/ip", () => ({
  extractClientIp: () => "127.0.0.1",
}));

describe("POST /api/v1/recruiting/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeInMemoryRateLimitMock.mockReturnValue({ limited: false });

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "token-1" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        valid: true,
        status: "pending",
        expiresAt: "2026-05-01T00:00:00.000Z",
      },
    });
  });
});

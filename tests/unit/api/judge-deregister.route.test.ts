import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  isJudgeAuthorizedMock,
  findFirstMock,
  updateRunMock,
  loggerMock,
} = vi.hoisted(() => ({
  isJudgeAuthorizedMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateRunMock: vi.fn(),
  loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/judge/auth", () => ({
  isJudgeAuthorized: isJudgeAuthorizedMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/lib/db/schema", () => ({
  judgeWorkers: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      judgeWorkers: { findFirst: findFirstMock },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          run: updateRunMock,
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/api/responses", async () => {
  const { NextResponse } = await import("next/server");
  return {
    apiSuccess: (data: unknown) => NextResponse.json({ data }),
    apiError: (error: string, status: number) =>
      NextResponse.json({ error }, { status }),
  };
});

import { POST } from "@/app/api/v1/judge/deregister/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/judge/deregister", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-token",
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  isJudgeAuthorizedMock.mockReturnValue(true);
  findFirstMock.mockResolvedValue({ secretToken: "secret-abc" });
  updateRunMock.mockReturnValue({ changes: 1 });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/v1/judge/deregister", () => {
  it("deregisters a worker successfully", async () => {
    const response = await POST(
      makeRequest({ workerId: "worker-1", workerSecret: "secret-abc" })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.ok).toBe(true);
    expect(loggerMock.info).toHaveBeenCalledOnce();
  });

  it("returns 401 when not authorized", async () => {
    isJudgeAuthorizedMock.mockReturnValue(false);

    const response = await POST(makeRequest({ workerId: "w1" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 when workerId is missing", async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
  });

  it("returns 404 when worker not found during secret validation", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ workerId: "w1", workerSecret: "secret" })
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when worker secret is invalid", async () => {
    findFirstMock.mockResolvedValue({ secretToken: "correct-secret" });

    const response = await POST(
      makeRequest({ workerId: "w1", workerSecret: "wrong-secret-x" })
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when update affects zero rows", async () => {
    updateRunMock.mockReturnValue({ changes: 0 });

    const response = await POST(
      makeRequest({ workerId: "nonexistent" })
    );

    expect(response.status).toBe(404);
  });

  it("succeeds without workerSecret (skip secret validation)", async () => {
    const response = await POST(
      makeRequest({ workerId: "worker-1" })
    );

    expect(response.status).toBe(200);
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    isJudgeAuthorizedMock.mockImplementation(() => {
      throw new Error("Unexpected");
    });

    const response = await POST(makeRequest({ workerId: "w1" }));

    expect(response.status).toBe(500);
  });
});

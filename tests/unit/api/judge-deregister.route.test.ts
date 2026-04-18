import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  isJudgeAuthorizedForWorkerMock,
  findFirstMock,
  updateWhereMock,
  loggerMock,
} = vi.hoisted(() => ({
  isJudgeAuthorizedForWorkerMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateWhereMock: vi.fn(),
  loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/judge/auth", () => ({
  isJudgeAuthorizedForWorker: isJudgeAuthorizedForWorkerMock,
  hashToken: (value: string) => `hashed:${value}`,
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
        where: updateWhereMock,
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

beforeEach(() => {
  vi.clearAllMocks();

  isJudgeAuthorizedForWorkerMock.mockResolvedValue({ authorized: true });
  findFirstMock.mockResolvedValue({ secretTokenHash: "hashed:secret-abc" });
  updateWhereMock.mockResolvedValue({ rowCount: 1 });
});

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
    isJudgeAuthorizedForWorkerMock.mockResolvedValue({ authorized: false, error: "invalidWorkerToken" });

    const response = await POST(makeRequest({ workerId: "w1", workerSecret: "secret-abc" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalidWorkerToken" });
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

  it("accepts a hashed worker secret during deregistration", async () => {
    findFirstMock.mockResolvedValue({ secretToken: null, secretTokenHash: "hashed:secret-abc" });

    const response = await POST(
      makeRequest({ workerId: "worker-1", workerSecret: "secret-abc" })
    );

    expect(response.status).toBe(200);
  });

  it("returns 404 when update affects zero rows", async () => {
    updateWhereMock.mockResolvedValue({ rowCount: 0 });
    findFirstMock.mockResolvedValue({ secretTokenHash: "hashed:secret-abc" });

    const response = await POST(
      makeRequest({ workerId: "nonexistent", workerSecret: "secret-abc" })
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 without workerSecret (now mandatory)", async () => {
    const response = await POST(
      makeRequest({ workerId: "worker-1" })
    );

    expect(response.status).toBe(400);
  });

  it("returns 500 on unexpected error", async () => {
    isJudgeAuthorizedForWorkerMock.mockRejectedValue(new Error("Unexpected"));

    const response = await POST(makeRequest({ workerId: "w1", workerSecret: "secret-abc" }));

    expect(response.status).toBe(500);
  });
});

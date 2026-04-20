import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

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

vi.mock("@/lib/judge/auth", async () => {
  const { createHash: realCreateHash } = await import("node:crypto");
  return {
    isJudgeAuthorizedForWorker: isJudgeAuthorizedForWorkerMock,
    hashToken: (value: string) => realCreateHash("sha256").update(value).digest("hex"),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/lib/db/schema", () => ({
  judgeWorkers: {
    id: "id",
    status: "status",
    lastHeartbeatAt: "lastHeartbeatAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  lt: vi.fn(),
  and: vi.fn(),
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

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/api/responses", async () => {
  const { NextResponse } = await import("next/server");
  return {
    apiSuccess: (data: unknown) => NextResponse.json({ data }),
    apiError: (error: string, status: number) =>
      NextResponse.json({ error }, { status }),
  };
});

import { POST } from "@/app/api/v1/judge/heartbeat/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/judge/heartbeat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-token",
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  workerId: "worker-1",
  workerSecret: "secret-abc",
  activeTasks: 2,
  availableSlots: 2,
};

beforeEach(() => {
  vi.clearAllMocks();

  isJudgeAuthorizedForWorkerMock.mockResolvedValue({ authorized: true });
  findFirstMock.mockResolvedValue({ secretTokenHash: sha256Hex("secret-abc") });
  updateWhereMock.mockResolvedValue({ rowCount: 1 });
});

describe("POST /api/v1/judge/heartbeat", () => {
  it("processes heartbeat successfully", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.ok).toBe(true);
  });

  it("returns 401 when not authorized", async () => {
    isJudgeAuthorizedForWorkerMock.mockResolvedValue({ authorized: false, error: "invalidWorkerToken" });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalidWorkerToken" });
  });

  it("returns 400 when workerId is missing", async () => {
    const response = await POST(makeRequest({ activeTasks: 0, availableSlots: 4 }));

    expect(response.status).toBe(400);
  });

  it("returns 404 when worker not found during secret validation", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toBe("workerNotFound");
  });

  it("returns 403 when worker secret is invalid", async () => {
    findFirstMock.mockResolvedValue({ secretTokenHash: sha256Hex("correct-secret") });

    const response = await POST(
      makeRequest({ ...VALID_BODY, workerSecret: "wrong-secret-x" })
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe("invalidWorkerSecret");
  });

  it("returns 403 when worker has no secretTokenHash stored", async () => {
    findFirstMock.mockResolvedValue({ secretTokenHash: null });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe("workerSecretNotConfigured");
  });

  it("returns 404 when update affects zero rows", async () => {
    updateWhereMock.mockResolvedValue({ rowCount: 0 });
    findFirstMock.mockResolvedValue({ secretTokenHash: sha256Hex("secret-abc") });

    const response = await POST(
      makeRequest({ workerId: "nonexistent", workerSecret: "secret-abc", activeTasks: 0, availableSlots: 0 })
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 without workerSecret (now mandatory)", async () => {
    const response = await POST(
      makeRequest({ workerId: "worker-1", activeTasks: 1, availableSlots: 3 })
    );

    expect(response.status).toBe(400);
  });

  it("returns 500 on unexpected error", async () => {
    isJudgeAuthorizedForWorkerMock.mockRejectedValue(new Error("Unexpected"));

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(500);
  });
});

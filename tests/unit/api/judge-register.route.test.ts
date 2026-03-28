import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  isJudgeAuthorizedMock,
  insertMock,
  returningMock,
  extractClientIpMock,
  loggerMock,
} = vi.hoisted(() => ({
  isJudgeAuthorizedMock: vi.fn(),
  insertMock: vi.fn(),
  returningMock: vi.fn(),
  extractClientIpMock: vi.fn(),
  loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/judge/auth", () => ({
  isJudgeAuthorized: isJudgeAuthorizedMock,
}));

vi.mock("@/lib/security/ip", () => ({
  extractClientIp: extractClientIpMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/lib/db/schema", () => ({
  judgeWorkers: { id: "id" },
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: insertMock,
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

import { POST } from "@/app/api/v1/judge/register/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/judge/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-token",
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  hostname: "worker-01",
  concurrency: 4,
  version: "1.0.0",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  isJudgeAuthorizedMock.mockReturnValue(true);
  extractClientIpMock.mockReturnValue("192.168.1.100");

  returningMock.mockResolvedValue([{ id: "worker-1" }]);
  insertMock.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: returningMock,
    }),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/v1/judge/register", () => {
  it("registers a worker successfully", async () => {
    const response = await POST(makeRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workerId).toBe("worker-1");
    expect(payload.data.workerSecret).toBeDefined();
    expect(typeof payload.data.workerSecret).toBe("string");
    expect(payload.data.heartbeatIntervalMs).toBe(30_000);
    expect(payload.data.staleClaimTimeoutMs).toBe(300_000);
  });

  it("returns 401 when not authorized", async () => {
    isJudgeAuthorizedMock.mockReturnValue(false);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
  });

  it("returns 400 when hostname is missing", async () => {
    const response = await POST(makeRequest({ concurrency: 4 }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when concurrency is zero", async () => {
    const response = await POST(makeRequest({ hostname: "w1", concurrency: 0 }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when concurrency exceeds 64", async () => {
    const response = await POST(makeRequest({ hostname: "w1", concurrency: 65 }));

    expect(response.status).toBe(400);
  });

  it("accepts optional labels array", async () => {
    const response = await POST(
      makeRequest({ ...VALID_BODY, labels: ["gpu", "fast"] })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workerId).toBe("worker-1");
  });

  it("logs registration on success", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(loggerMock.info).toHaveBeenCalledOnce();
    expect(loggerMock.info).toHaveBeenCalledWith(
      expect.objectContaining({ workerId: "worker-1", hostname: "worker-01" }),
      expect.stringContaining("Worker registered")
    );
  });

  it("returns 500 on unexpected error", async () => {
    insertMock.mockImplementation(() => {
      throw new Error("DB down");
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  canAccessSubmissionMock,
  resolveCapabilitiesMock,
  submissionsFindFirstMock,
  assignmentsFindFirstMock,
  consumeApiRateLimitMock,
  getUnsupportedRealtimeGuardMock,
  releaseSharedSseConnectionSlotMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  canAccessSubmissionMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  submissionsFindFirstMock: vi.fn(),
  assignmentsFindFirstMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  getUnsupportedRealtimeGuardMock: vi.fn(),
  releaseSharedSseConnectionSlotMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: () => NextResponse.json({ error: "notFound" }, { status: 404 }),
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessSubmission: canAccessSubmissionMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/realtime/realtime-coordination", () => ({
  acquireSharedSseConnectionSlot: vi.fn(),
  getRealtimeConnectionKey: vi.fn(() => "shared-connection-key"),
  getUnsupportedRealtimeGuard: getUnsupportedRealtimeGuardMock,
  releaseSharedSseConnectionSlot: releaseSharedSseConnectionSlotMock,
  usesSharedRealtimeCoordination: vi.fn(() => false),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: vi.fn(() => ({
    ssePollIntervalMs: 2_000,
    sseTimeoutMs: 300_000,
    maxSseConnectionsPerUser: 5,
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      submissions: {
        findFirst: submissionsFindFirstMock,
      },
      assignments: {
        findFirst: assignmentsFindFirstMock,
      },
    },
  },
}));

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/v1/submissions/sub-1/events", {
    method: "GET",
  });
}

describe("GET /api/v1/submissions/[id]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "student-1",
      role: "student",
      username: "student",
      email: "student@example.com",
      name: "Student",
      className: null,
      mustChangePassword: false,
    });
    canAccessSubmissionMock.mockResolvedValue(true);
    resolveCapabilitiesMock.mockResolvedValue(new Set());
    consumeApiRateLimitMock.mockResolvedValue(null);
    getUnsupportedRealtimeGuardMock.mockReturnValue(null);
    assignmentsFindFirstMock.mockResolvedValue({
      showResultsToCandidate: false,
      hideScoresFromCandidates: true,
    });
  });

  it("applies assignment result hiding to terminal SSE payloads", async () => {
    submissionsFindFirstMock
      .mockResolvedValueOnce({
        id: "sub-1",
        userId: "student-1",
        status: "accepted",
        assignmentId: "assignment-1",
      })
      .mockResolvedValueOnce({
        id: "sub-1",
        userId: "student-1",
        assignmentId: "assignment-1",
        status: "accepted",
        sourceCode: 'print("secret")',
        compileOutput: "warning",
        executionTimeMs: 12,
        memoryUsedKb: 256,
        score: 100,
        failedTestCaseIndex: 3,
        runtimeErrorType: "SIGSEGV",
        problem: {
          id: "problem-1",
          title: "Problem",
          showCompileOutput: true,
          showDetailedResults: true,
          showRuntimeErrors: true,
        },
        user: { name: "Student" },
        results: [
          {
            id: "result-1",
            status: "wrong_answer",
            actualOutput: "hidden answer\n",
            executionTimeMs: 12,
            memoryUsedKb: 256,
            testCase: { sortOrder: 2, isVisible: true },
          },
        ],
      });

    const { GET } = await import("@/app/api/v1/submissions/[id]/events/route");
    const response = await GET(makeRequest(), { params: Promise.resolve({ id: "sub-1" }) });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: result");

    const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice(6));

    expect(payload.score).toBeNull();
    expect(payload.compileOutput).toBeNull();
    expect(payload.executionTimeMs).toBeNull();
    expect(payload.memoryUsedKb).toBeNull();
    expect(payload.failedTestCaseIndex).toBeNull();
    expect(payload.runtimeErrorType).toBeNull();
    expect(payload.results).toEqual([]);
  });
});

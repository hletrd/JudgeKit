import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getContestAssignmentMock,
  runAndStoreSimilarityCheckMock,
  canManageContestMock,
  resolveCapabilitiesMock,
  isGroupTAMock,
  getAssignedTeachingGroupIdsMock,
  getApiUserMock,
  consumeApiRateLimitMock,
  csrfForbiddenMock,
  mockUser,
} = vi.hoisted(() => ({
  getContestAssignmentMock: vi.fn(),
  runAndStoreSimilarityCheckMock: vi.fn(),
  canManageContestMock: vi.fn(() => true),
  resolveCapabilitiesMock: vi.fn(),
  isGroupTAMock: vi.fn(),
  getAssignedTeachingGroupIdsMock: vi.fn(),
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  mockUser: {
    id: "admin-1",
    role: "admin",
    username: "admin",
    email: "admin@example.com",
    name: "Admin",
    className: null,
    mustChangePassword: false,
  },
}));

const {
  dbSelectMock,
  dbFromMock,
  dbWhereMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbFromMock: vi.fn(),
  dbWhereMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
  csrfForbidden: csrfForbiddenMock,
  isAdminAsync: vi.fn(() => false),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown) => NextResponse.json({ data }, { status: 200 }),
  apiError: (error: string, status: number) => NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
  canManageContest: canManageContestMock,
}));

vi.mock("@/lib/assignments/management", () => ({
  getAssignedTeachingGroupIds: getAssignedTeachingGroupIdsMock,
  isGroupTA: isGroupTAMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/assignments/code-similarity", () => ({
  runAndStoreSimilarityCheck: runAndStoreSimilarityCheckMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users: {
    id: "users.id",
    username: "users.username",
    name: "users.name",
  },
}));

function createRequest(opts?: { headers?: Record<string, string>; requestId?: string }) {
  const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest", ...opts?.headers };
  if (opts?.requestId) {
    headers["X-Request-Id"] = opts.requestId;
  }
  return new NextRequest("http://localhost:3000/api/v1/contests/assignment-1/similarity-check", {
    method: "POST",
    headers,
  });
}

describe("POST /api/v1/contests/[assignmentId]/similarity-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    getApiUserMock.mockResolvedValue(mockUser);
    consumeApiRateLimitMock.mockResolvedValue(null);
    csrfForbiddenMock.mockResolvedValue(null);
    getContestAssignmentMock.mockResolvedValue({
      id: "assignment-1",
      examMode: "scheduled",
      groupId: "group-1",
      instructorId: "admin-1",
    });
    canManageContestMock.mockResolvedValue(true);
    resolveCapabilitiesMock.mockResolvedValue(new Set());
    isGroupTAMock.mockResolvedValue(false);
    getAssignedTeachingGroupIdsMock.mockResolvedValue([]);
    dbWhereMock.mockResolvedValue([]);
    dbFromMock.mockReturnValue({ where: dbWhereMock });
    dbSelectMock.mockReturnValue({ from: dbFromMock });
  });

  it("returns 401 when the request is unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const req = createRequest();
    const res = await POST(req, { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(consumeApiRateLimitMock).toHaveBeenCalledWith(req, "similarity-check");
  });

  it("returns 429 when the IP rate limit is consumed", async () => {
    consumeApiRateLimitMock.mockResolvedValue(
      NextResponse.json({ error: "rateLimitExceeded" }, { status: 429 }),
    );

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const req = createRequest();
    const res = await POST(req, { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe("rateLimitExceeded");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
    expect(getApiUserMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the CSRF header is missing", async () => {
    csrfForbiddenMock.mockResolvedValue(
      NextResponse.json({ error: "csrfForbidden" }, { status: 403 }),
    );

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const req = new NextRequest("http://localhost:3000/api/v1/contests/assignment-1/similarity-check", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("csrfForbidden");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("returns 404 when the assignment is missing", async () => {
    getContestAssignmentMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const req = createRequest();
    const res = await POST(req, { params: Promise.resolve({ assignmentId: "missing-id" }) } as never);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("notFound");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("returns 403 when the user lacks capability and group-TA access", async () => {
    canManageContestMock.mockResolvedValue(false);
    resolveCapabilitiesMock.mockResolvedValue(new Set());

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const req = createRequest();
    const res = await POST(req, { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("forbidden");
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("preserves an incoming X-Request-Id header", async () => {
    runAndStoreSimilarityCheckMock.mockResolvedValue({
      status: "completed",
      reason: null,
      flaggedPairs: 0,
      submissionCount: 2,
      maxSupportedSubmissions: 500,
      pairs: [],
    });

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const req = createRequest({ requestId: "req-abc-123" });
    const res = await POST(req, { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);

    expect(res.headers.get("X-Request-Id")).toBe("req-abc-123");
  });

  it("returns the explicit not_run reason instead of silently reporting zero flagged pairs", async () => {
    runAndStoreSimilarityCheckMock.mockResolvedValue({
      status: "not_run",
      reason: "too_many_submissions",
      flaggedPairs: 0,
      submissionCount: 700,
      maxSupportedSubmissions: 500,
    });

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const res = await POST(createRequest(), { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      status: "not_run",
      reason: "too_many_submissions",
      submissionCount: 700,
    });
  });

  it("returns explicit timed_out status when the scan exceeds the route timeout", async () => {
    runAndStoreSimilarityCheckMock.mockImplementation(
      (_assignmentId: string, _options: unknown, signal: AbortSignal) => {
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      },
    );

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const req = createRequest();
    const resPromise = POST(req, { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);
    await vi.advanceTimersByTimeAsync(30_001);
    const res = await resPromise;
    vi.useRealTimers();

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      status: "timed_out",
      reason: "timeout",
    });
  });

  it("allows assigned assistants with anti_cheat.run_similarity to run the scan", async () => {
    canManageContestMock.mockResolvedValue(false);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["anti_cheat.run_similarity"]));
    getAssignedTeachingGroupIdsMock.mockResolvedValue(["group-1"]);
    runAndStoreSimilarityCheckMock.mockResolvedValue({
      status: "completed",
      reason: null,
      flaggedPairs: 0,
      submissionCount: 2,
      maxSupportedSubmissions: 500,
      pairs: [],
    });

    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/similarity-check/route");
    const res = await POST(createRequest(), { params: Promise.resolve({ assignmentId: "assignment-1" }) } as never);
    expect(res.status).toBe(200);
    expect(runAndStoreSimilarityCheckMock).toHaveBeenCalledWith("assignment-1", undefined, expect.any(AbortSignal));
  });
});

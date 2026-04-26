import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  computeContestAnalyticsMock,
  canViewAssignmentSubmissionsMock,
  rawQueryOneMock,
  getDbNowMsMock,
  loggerErrorMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  computeContestAnalyticsMock: vi.fn(),
  canViewAssignmentSubmissionsMock: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
  rawQueryOneMock: vi.fn(),
  getDbNowMsMock: vi.fn<() => Promise<number>>(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; params: any }) => Promise<Response> }) =>
    async (req: NextRequest, ctx: { params: Promise<{ assignmentId: string }> }) => {
      const params = await ctx.params;
      return handler(req, {
        user: { id: "instructor-1", role: "instructor", username: "instructor" },
        params,
      });
    },
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/assignments/contest-analytics", () => ({
  computeContestAnalytics: computeContestAnalyticsMock,
}));

vi.mock("@/lib/assignments/submissions", () => ({
  canViewAssignmentSubmissions: canViewAssignmentSubmissionsMock,
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowMs: getDbNowMsMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: loggerWarnMock,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const ASSIGNMENT_ID = "assign-1";

function makeReq(): NextRequest {
  return new NextRequest(`http://localhost/api/v1/contests/${ASSIGNMENT_ID}/analytics`);
}

function makeCtx() {
  return { params: Promise.resolve({ assignmentId: ASSIGNMENT_ID }) };
}

async function callRoute() {
  // Re-import the route module fresh on each call (so module-level cache is reset).
  vi.resetModules();
  const { GET } = await import("@/app/api/v1/contests/[assignmentId]/analytics/route");
  return GET(makeReq(), makeCtx());
}

describe("GET /api/v1/contests/[assignmentId]/analytics — staleness & cooldown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    rawQueryOneMock.mockResolvedValue({
      groupId: "g1",
      instructorId: "instructor-1",
      examMode: "exam",
    });
    canViewAssignmentSubmissionsMock.mockResolvedValue(true);
    computeContestAnalyticsMock.mockResolvedValue({ summary: "ok" });
    getDbNowMsMock.mockResolvedValue(new Date("2026-04-26T12:00:00.000Z").getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 when assignment is missing or examMode is none", async () => {
    rawQueryOneMock.mockResolvedValueOnce(null);
    const res = await callRoute();
    expect(res.status).toBe(404);
  });

  it("returns 403 when canViewAssignmentSubmissions is false", async () => {
    canViewAssignmentSubmissionsMock.mockResolvedValueOnce(false);
    const res = await callRoute();
    expect(res.status).toBe(403);
  });

  it("populates cache on first request (cache miss path)", async () => {
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(computeContestAnalyticsMock).toHaveBeenCalledTimes(1);
    // First populate also calls getDbNowMs once (cache write).
    expect(getDbNowMsMock).toHaveBeenCalledTimes(1);
  });

  it("returns cached data on second request without calling getDbNowMs for staleness", async () => {
    // Prime cache.
    await callRoute();
    expect(computeContestAnalyticsMock).toHaveBeenCalledTimes(1);

    // Within the same module, second request should hit cache directly via Date.now().
    // We need to NOT reset modules to keep the module-level cache populated.
    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/analytics/route");

    // Advance clock 5s — well within STALE_AFTER_MS (30s).
    vi.setSystemTime(new Date("2026-04-26T12:00:05.000Z"));

    getDbNowMsMock.mockClear();
    computeContestAnalyticsMock.mockClear();

    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    // No new compute, no new DB time call.
    expect(computeContestAnalyticsMock).not.toHaveBeenCalled();
    expect(getDbNowMsMock).not.toHaveBeenCalled();
  });

  it("triggers exactly one background refresh when cache is stale (in-progress dedup)", async () => {
    // Prime cache at T=0.
    await callRoute();

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/analytics/route");

    // Advance clock past STALE_AFTER_MS (30s).
    vi.setSystemTime(new Date("2026-04-26T12:00:31.000Z"));

    // Make compute slow so the first refresh is still in progress when the
    // second GET runs (this exercises the _refreshingKeys.has() dedup guard).
    let resolveCompute: ((value: { summary: string }) => void) | undefined;
    const slowPromise = new Promise<{ summary: string }>((resolve) => {
      resolveCompute = resolve;
    });
    computeContestAnalyticsMock.mockReset();
    computeContestAnalyticsMock.mockReturnValueOnce(slowPromise);

    // Fire two GETs in quick succession — first should trigger the refresh,
    // second should see _refreshingKeys.has() and skip.
    const [r1, r2] = await Promise.all([
      GET(makeReq(), makeCtx()),
      GET(makeReq(), makeCtx()),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Only ONE refresh should be in flight even though both GETs saw stale.
    expect(computeContestAnalyticsMock).toHaveBeenCalledTimes(1);

    // Resolve to clean up.
    resolveCompute?.({ summary: "fresh" });
    await vi.runAllTimersAsync();
  });

  it("sets cooldown when background refresh fails (logger.error invoked)", async () => {
    // Prime cache.
    await callRoute();

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/analytics/route");

    vi.setSystemTime(new Date("2026-04-26T12:00:31.000Z"));

    // Make compute throw.
    computeContestAnalyticsMock.mockReset();
    computeContestAnalyticsMock.mockRejectedValueOnce(new Error("db down"));

    loggerErrorMock.mockClear();

    await GET(makeReq(), makeCtx());
    await vi.runAllTimersAsync();

    // Should log the failure.
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: ASSIGNMENT_ID }),
      expect.stringContaining("Failed to refresh analytics cache"),
    );
  });

  it("respects cooldown — does not retry refresh within REFRESH_FAILURE_COOLDOWN_MS", async () => {
    // Prime cache.
    await callRoute();

    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/analytics/route");

    vi.setSystemTime(new Date("2026-04-26T12:00:31.000Z"));

    // First refresh fails.
    computeContestAnalyticsMock.mockReset();
    computeContestAnalyticsMock.mockRejectedValueOnce(new Error("db down"));
    await GET(makeReq(), makeCtx());
    await vi.runAllTimersAsync();
    expect(computeContestAnalyticsMock).toHaveBeenCalledTimes(1);

    // Advance 1s — still within 5s cooldown.
    vi.setSystemTime(new Date("2026-04-26T12:00:32.000Z"));
    computeContestAnalyticsMock.mockClear();

    // Subsequent stale request should NOT retry compute.
    await GET(makeReq(), makeCtx());
    await vi.runAllTimersAsync();
    expect(computeContestAnalyticsMock).not.toHaveBeenCalled();
  });
});

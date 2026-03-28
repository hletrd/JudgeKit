import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  redeemAccessCodeMock,
  setAccessCodeMock,
  revokeAccessCodeMock,
  getAccessCodeMock,
  getContestAssignmentMock,
  computeLeaderboardMock,
  getLeaderboardProblemsMock,
  sqliteGetMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  redeemAccessCodeMock: vi.fn(),
  setAccessCodeMock: vi.fn(),
  revokeAccessCodeMock: vi.fn(),
  getAccessCodeMock: vi.fn(),
  getContestAssignmentMock: vi.fn(),
  computeLeaderboardMock: vi.fn(),
  getLeaderboardProblemsMock: vi.fn(),
  sqliteGetMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  isInstructor: (role: string) =>
    role === "instructor" || role === "admin" || role === "super_admin",
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/assignments/access-codes", () => ({
  redeemAccessCode: redeemAccessCodeMock,
  setAccessCode: setAccessCodeMock,
  revokeAccessCode: revokeAccessCodeMock,
  getAccessCode: getAccessCodeMock,
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
}));

vi.mock("@/lib/assignments/leaderboard", () => ({
  computeLeaderboard: computeLeaderboardMock,
  getLeaderboardProblems: getLeaderboardProblemsMock,
}));

// sqlite is used directly via prepared statements in leaderboard + analytics routes
vi.mock("@/lib/db", () => ({
  sqlite: {
    prepare: vi.fn(() => ({
      get: sqliteGetMock,
    })),
  },
  db: {},
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks
// ---------------------------------------------------------------------------
import { POST as joinPOST } from "@/app/api/v1/contests/join/route";
import {
  GET as accessCodeGET,
  POST as accessCodePOST,
  DELETE as accessCodeDELETE,
} from "@/app/api/v1/contests/[assignmentId]/access-code/route";
import { GET as leaderboardGET } from "@/app/api/v1/contests/[assignmentId]/leaderboard/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJoinRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/contests/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid",
    },
    body: JSON.stringify(body),
  });
}

function makeAccessCodeRequest(method: string, assignmentId = "assign-1") {
  return new NextRequest(
    `http://localhost:3000/api/v1/contests/${assignmentId}/access-code`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "valid",
      },
    }
  );
}

function makeLeaderboardRequest(assignmentId = "assign-1") {
  return new NextRequest(
    `http://localhost:3000/api/v1/contests/${assignmentId}/leaderboard`,
    { method: "GET" }
  );
}

const PARAMS = (assignmentId = "assign-1") =>
  Promise.resolve({ assignmentId });

const ADMIN_USER = { id: "admin-1", role: "admin", username: "admin" };
const INSTRUCTOR_USER = { id: "inst-1", role: "instructor", username: "instructor" };
const STUDENT_USER = { id: "student-1", role: "student", username: "student" };

const CONTEST_ASSIGNMENT = {
  id: "assign-1",
  groupId: "group-1",
  instructorId: "inst-1",
  examMode: "icpc",
};

const LEADERBOARD_DATA = {
  scoringModel: "icpc",
  frozen: false,
  frozenAt: null,
  startsAt: new Date().toISOString(),
  entries: [
    { userId: "student-1", username: "alice", rank: 1, penalty: 0, solvedCount: 3 },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  getApiUserMock.mockResolvedValue(ADMIN_USER);
  getContestAssignmentMock.mockReturnValue(CONTEST_ASSIGNMENT);
  getAccessCodeMock.mockReturnValue("ABC123");
  setAccessCodeMock.mockReturnValue("XYZ789");
  revokeAccessCodeMock.mockReturnValue(undefined);

  // Leaderboard
  sqliteGetMock.mockReturnValue({
    groupId: "group-1",
    instructorId: "inst-1",
    examMode: "icpc",
  });
  computeLeaderboardMock.mockReturnValue(LEADERBOARD_DATA);
  getLeaderboardProblemsMock.mockReturnValue([{ id: "p-1", title: "Problem A" }]);

  // Join
  redeemAccessCodeMock.mockReturnValue({
    ok: true,
    assignmentId: "assign-1",
    groupId: "group-1",
    alreadyEnrolled: false,
  });
});

// ===========================================================================
// POST /api/v1/contests/join
// ===========================================================================

describe("POST /api/v1/contests/join", () => {
  it("returns 403 when CSRF check fails", async () => {
    csrfForbiddenMock.mockReturnValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    );
    const res = await joinPOST(makeJoinRequest({ code: "ABC" }));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    consumeApiRateLimitMock.mockReturnValue(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );
    const res = await joinPOST(makeJoinRequest({ code: "ABC" }));
    expect(res.status).toBe(429);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await joinPOST(makeJoinRequest({ code: "ABC" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 when code is missing", async () => {
    const res = await joinPOST(makeJoinRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is empty string", async () => {
    const res = await joinPOST(makeJoinRequest({ code: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("accessCodeRequired");
  });

  it("successfully joins a contest and returns assignment info", async () => {
    const res = await joinPOST(makeJoinRequest({ code: "ABC123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      assignmentId: "assign-1",
      groupId: "group-1",
      alreadyEnrolled: false,
    });
    expect(redeemAccessCodeMock).toHaveBeenCalledOnce();
  });

  it("returns alreadyEnrolled: true when student was already enrolled", async () => {
    redeemAccessCodeMock.mockReturnValue({
      ok: true,
      assignmentId: "assign-1",
      groupId: "group-1",
      alreadyEnrolled: true,
    });
    const res = await joinPOST(makeJoinRequest({ code: "ABC123" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.alreadyEnrolled).toBe(true);
  });

  it("returns 400 when redemption fails with an error", async () => {
    redeemAccessCodeMock.mockReturnValue({ ok: false, error: "invalidAccessCode" });
    const res = await joinPOST(makeJoinRequest({ code: "WRONG" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidAccessCode");
  });

  it("returns 500 on unexpected error", async () => {
    redeemAccessCodeMock.mockImplementation(() => {
      throw new Error("Unexpected DB error");
    });
    const res = await joinPOST(makeJoinRequest({ code: "ABC" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("joinFailed");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// GET /api/v1/contests/[assignmentId]/access-code
// ===========================================================================

describe("GET /api/v1/contests/[assignmentId]/access-code", () => {
  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment does not exist", async () => {
    getContestAssignmentMock.mockReturnValue(null);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("notFound");
  });

  it("returns 404 when examMode is 'none'", async () => {
    getContestAssignmentMock.mockReturnValue({ ...CONTEST_ASSIGNMENT, examMode: "none" });
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when student tries to get access code", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 403 when instructor of a different assignment tries to get code", async () => {
    getApiUserMock.mockResolvedValue({ ...INSTRUCTOR_USER, id: "other-inst" });
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(403);
  });

  it("returns access code for admin", async () => {
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ accessCode: "ABC123" });
  });

  it("returns access code for the owning instructor", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.accessCode).toBe("ABC123");
  });

  it("returns 500 on unexpected error", async () => {
    getContestAssignmentMock.mockImplementation(() => {
      throw new Error("DB error");
    });
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(500);
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// POST /api/v1/contests/[assignmentId]/access-code
// ===========================================================================

describe("POST /api/v1/contests/[assignmentId]/access-code", () => {
  it("returns 403 when CSRF check fails", async () => {
    csrfForbiddenMock.mockReturnValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    );
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment does not exist", async () => {
    getContestAssignmentMock.mockReturnValue(null);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a student", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(403);
  });

  it("generates a new access code and returns 201 for admin", async () => {
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ accessCode: "XYZ789" });
    expect(setAccessCodeMock).toHaveBeenCalledWith("assign-1");
  });

  it("generates a new access code and returns 201 for owning instructor", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(201);
  });

  it("returns 500 on unexpected error", async () => {
    setAccessCodeMock.mockImplementation(() => {
      throw new Error("crash");
    });
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(500);
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// DELETE /api/v1/contests/[assignmentId]/access-code
// ===========================================================================

describe("DELETE /api/v1/contests/[assignmentId]/access-code", () => {
  it("returns 403 when CSRF check fails", async () => {
    csrfForbiddenMock.mockReturnValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    );
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment does not exist", async () => {
    getContestAssignmentMock.mockReturnValue(null);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a student", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(403);
  });

  it("revokes the access code and returns null for admin", async () => {
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ accessCode: null });
    expect(revokeAccessCodeMock).toHaveBeenCalledWith("assign-1");
  });

  it("revokes the access code for owning instructor", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(200);
    expect(revokeAccessCodeMock).toHaveBeenCalledOnce();
  });

  it("returns 500 on unexpected error", async () => {
    revokeAccessCodeMock.mockImplementation(() => {
      throw new Error("crash");
    });
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), {
      params: PARAMS(),
    });
    expect(res.status).toBe(500);
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// GET /api/v1/contests/[assignmentId]/leaderboard
// ===========================================================================

describe("GET /api/v1/contests/[assignmentId]/leaderboard", () => {
  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    consumeApiRateLimitMock.mockReturnValue(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(429);
  });

  it("returns 404 when assignment is not found", async () => {
    sqliteGetMock.mockReturnValue(null);
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("notFound");
  });

  it("returns 404 when examMode is 'none'", async () => {
    sqliteGetMock.mockReturnValue({ groupId: "g-1", instructorId: "i-1", examMode: "none" });
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when student is not enrolled and has no access token", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    // Second prepare().get() returns null = no enrollment
    sqliteGetMock
      .mockReturnValueOnce({ groupId: "g-1", instructorId: "inst-1", examMode: "icpc" })
      .mockReturnValueOnce(null);
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns leaderboard for admin with full userId in entries", async () => {
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.scoringModel).toBe("icpc");
    expect(body.data.entries).toHaveLength(1);
    // Admin (instructorView) sees the real userId
    expect(body.data.entries[0].userId).toBe("student-1");
  });

  it("strips userId from entries for enrolled students", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    // First get = assignment row, second get = enrollment row (truthy = has access)
    sqliteGetMock
      .mockReturnValueOnce({ groupId: "g-1", instructorId: "inst-1", examMode: "icpc" })
      .mockReturnValueOnce({ 1: 1 }); // enrolled

    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Student view: userId is stripped
    expect(body.data.entries[0].userId).toBe("");
  });

  it("marks the current user's entry with isCurrentUser for students", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    sqliteGetMock
      .mockReturnValueOnce({ groupId: "g-1", instructorId: "inst-1", examMode: "icpc" })
      .mockReturnValueOnce({ 1: 1 });

    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    const body = await res.json();
    // The entry's original userId matches the student's id
    expect(body.data.entries[0].isCurrentUser).toBe(true);
  });

  it("returns problems list alongside leaderboard", async () => {
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    const body = await res.json();
    expect(body.data.problems).toEqual([{ id: "p-1", title: "Problem A" }]);
  });

  it("returns 500 on unexpected error", async () => {
    computeLeaderboardMock.mockImplementation(() => {
      throw new Error("compute crash");
    });
    const res = await leaderboardGET(makeLeaderboardRequest(), {
      params: PARAMS(),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("leaderboardLoadFailed");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

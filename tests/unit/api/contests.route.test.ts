import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  redeemAccessCodeMock,
  setAccessCodeMock,
  revokeAccessCodeMock,
  getAccessCodeMock,
  getContestAssignmentMock,
  canManageContestMock,
  computeLeaderboardMock,
  getLeaderboardProblemsMock,
  rawQueryOneMock,
  getRecruitingAccessContextMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  redeemAccessCodeMock: vi.fn(),
  setAccessCodeMock: vi.fn(),
  revokeAccessCodeMock: vi.fn(),
  getAccessCodeMock: vi.fn(),
  getContestAssignmentMock: vi.fn(),
  canManageContestMock: vi.fn(),
  computeLeaderboardMock: vi.fn(),
  getLeaderboardProblemsMock: vi.fn(),
  rawQueryOneMock: vi.fn(),
  getRecruitingAccessContextMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  isInstructor: (role: string) => role === "instructor" || role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/assignments/access-codes", () => ({
  redeemAccessCode: redeemAccessCodeMock,
  setAccessCode: setAccessCodeMock,
  revokeAccessCode: revokeAccessCodeMock,
  getAccessCode: getAccessCodeMock,
}));

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
  canManageContest: canManageContestMock,
}));

vi.mock("@/lib/assignments/leaderboard", () => ({
  computeLeaderboard: computeLeaderboardMock,
  getLeaderboardProblems: getLeaderboardProblemsMock,
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/recruiting/access", () => ({
  getRecruitingAccessContext: getRecruitingAccessContextMock,
}));

vi.mock("@/lib/security/constants", () => ({
  isUserRole: vi.fn(() => true),
}));

import { POST as joinPOST } from "@/app/api/v1/contests/join/route";
import {
  GET as accessCodeGET,
  POST as accessCodePOST,
  DELETE as accessCodeDELETE,
} from "@/app/api/v1/contests/[assignmentId]/access-code/route";
import { GET as leaderboardGET } from "@/app/api/v1/contests/[assignmentId]/leaderboard/route";

function makeJoinRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/contests/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

function makeAccessCodeRequest(method: string, assignmentId = "assign-1") {
  return new NextRequest(`http://localhost:3000/api/v1/contests/${assignmentId}/access-code`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
}

function makeLeaderboardRequest(assignmentId = "assign-1") {
  return new NextRequest(`http://localhost:3000/api/v1/contests/${assignmentId}/leaderboard`, {
    method: "GET",
  });
}

const PARAMS = (assignmentId = "assign-1") => Promise.resolve({ assignmentId });

const ADMIN_USER = {
  id: "admin-1",
  role: "admin",
  username: "admin",
  email: "admin@example.com",
  name: "Admin",
  className: null,
  mustChangePassword: false,
};
const INSTRUCTOR_USER = {
  id: "inst-1",
  role: "instructor",
  username: "instructor",
  email: "inst@example.com",
  name: "Instructor",
  className: null,
  mustChangePassword: false,
};
const STUDENT_USER = {
  id: "student-1",
  role: "student",
  username: "student",
  email: "student@example.com",
  name: "Student",
  className: null,
  mustChangePassword: false,
};

const CONTEST_ASSIGNMENT = {
  id: "assign-1",
  groupId: "group-1",
  instructorId: "inst-1",
  examMode: "scheduled",
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

describe("POST /api/v1/contests/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockReturnValue(null);
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    getRecruitingAccessContextMock.mockResolvedValue({
      assignmentIds: [],
      problemIds: [],
      isRecruitingCandidate: false,
      effectivePlatformMode: "homework",
    });
    redeemAccessCodeMock.mockResolvedValue({
      ok: true,
      assignmentId: "assign-1",
      groupId: "group-1",
      alreadyEnrolled: false,
    });
  });

  it("returns 429 when rate limited", async () => {
    consumeApiRateLimitMock.mockReturnValue(NextResponse.json({ error: "rateLimited" }, { status: 429 }));
    const res = await joinPOST(makeJoinRequest({ code: "ABC" }));
    expect(res.status).toBe(429);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await joinPOST(makeJoinRequest({ code: "ABC" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when code is missing", async () => {
    const res = await joinPOST(makeJoinRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is empty string", async () => {
    const res = await joinPOST(makeJoinRequest({ code: "" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("accessCodeRequired");
  });

  it("successfully joins a contest and returns assignment info", async () => {
    const res = await joinPOST(makeJoinRequest({ code: "ABC123" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      assignmentId: "assign-1",
      groupId: "group-1",
      alreadyEnrolled: false,
    });
  });

  it("returns alreadyEnrolled: true when student was already enrolled", async () => {
    redeemAccessCodeMock.mockResolvedValue({
      ok: true,
      assignmentId: "assign-1",
      groupId: "group-1",
      alreadyEnrolled: true,
    });
    const res = await joinPOST(makeJoinRequest({ code: "ABC123" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.alreadyEnrolled).toBe(true);
  });

  it("returns 400 when redemption fails with an error", async () => {
    redeemAccessCodeMock.mockResolvedValue({ ok: false, error: "invalidAccessCode" });
    const res = await joinPOST(makeJoinRequest({ code: "WRONG" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalidAccessCode");
  });

  it("returns 403 when a recruiting candidate tries to join by access code", async () => {
    getRecruitingAccessContextMock.mockResolvedValueOnce({
      assignmentIds: ["assign-1"],
      problemIds: ["problem-1"],
      isRecruitingCandidate: true,
      effectivePlatformMode: "recruiting",
    });
    const res = await joinPOST(makeJoinRequest({ code: "ABC123" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe("forbidden");
    expect(redeemAccessCodeMock).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    redeemAccessCodeMock.mockRejectedValue(new Error("Unexpected DB error"));
    const res = await joinPOST(makeJoinRequest({ code: "ABC" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("internalServerError");
  });
});

describe("/api/v1/contests/[assignmentId]/access-code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    getContestAssignmentMock.mockResolvedValue(CONTEST_ASSIGNMENT);
    canManageContestMock.mockImplementation((user, assignment) => user.role === "admin" || assignment.instructorId === user.id);
    getAccessCodeMock.mockResolvedValue("ABC123");
    setAccessCodeMock.mockResolvedValue("XYZ789");
    revokeAccessCodeMock.mockResolvedValue(undefined);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment does not exist", async () => {
    getContestAssignmentMock.mockResolvedValue(null);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    expect(res.status).toBe(404);
  });

  it("returns 404 when examMode is 'none'", async () => {
    getContestAssignmentMock.mockResolvedValue({ ...CONTEST_ASSIGNMENT, examMode: "none" });
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    expect(res.status).toBe(404);
  });

  it("returns 403 when student tries to get access code", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    expect(res.status).toBe(403);
  });

  it("returns 403 when instructor of a different assignment tries to get code", async () => {
    getApiUserMock.mockResolvedValue({ ...INSTRUCTOR_USER, id: "other-inst" });
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    expect(res.status).toBe(403);
  });

  it("returns access code for admin", async () => {
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accessCode).toBe("ABC123");
  });

  it("returns access code for the owning instructor", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    expect(res.status).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    getContestAssignmentMock.mockRejectedValue(new Error("DB error"));
    const res = await accessCodeGET(makeAccessCodeRequest("GET"), { params: PARAMS() });
    expect(res.status).toBe(500);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), { params: PARAMS() });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment does not exist", async () => {
    getContestAssignmentMock.mockResolvedValue(null);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), { params: PARAMS() });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a student", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), { params: PARAMS() });
    expect(res.status).toBe(403);
  });

  it("generates a new access code and returns 201 for admin", async () => {
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), { params: PARAMS() });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.accessCode).toBe("XYZ789");
  });

  it("generates a new access code and returns 201 for owning instructor", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), { params: PARAMS() });
    expect(res.status).toBe(201);
  });

  it("returns 500 on unexpected error", async () => {
    setAccessCodeMock.mockRejectedValue(new Error("crash"));
    const res = await accessCodePOST(makeAccessCodeRequest("POST"), { params: PARAMS() });
    expect(res.status).toBe(500);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), { params: PARAMS() });
    expect(res.status).toBe(401);
  });

  it("returns 404 when assignment does not exist", async () => {
    getContestAssignmentMock.mockResolvedValue(null);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), { params: PARAMS() });
    expect(res.status).toBe(404);
  });

  it("returns 403 for a student", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), { params: PARAMS() });
    expect(res.status).toBe(403);
  });

  it("revokes the access code and returns null for admin", async () => {
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), { params: PARAMS() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accessCode).toBeNull();
  });

  it("revokes the access code for owning instructor", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), { params: PARAMS() });
    expect(res.status).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    revokeAccessCodeMock.mockRejectedValue(new Error("crash"));
    const res = await accessCodeDELETE(makeAccessCodeRequest("DELETE"), { params: PARAMS() });
    expect(res.status).toBe(500);
  });
});

describe("GET /api/v1/contests/[assignmentId]/leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    consumeApiRateLimitMock.mockReturnValue(null);
    rawQueryOneMock.mockResolvedValue({
      groupId: "g-1",
      instructorId: "inst-1",
      examMode: "scheduled",
      anonymousLeaderboard: 0,
    });
    computeLeaderboardMock.mockResolvedValue(LEADERBOARD_DATA);
    getLeaderboardProblemsMock.mockResolvedValue([{ id: "p-1", title: "Problem A" }]);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    consumeApiRateLimitMock.mockReturnValue(NextResponse.json({ error: "rateLimited" }, { status: 429 }));
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    expect(res.status).toBe(429);
  });

  it("returns 404 when assignment is not found", async () => {
    rawQueryOneMock.mockResolvedValue(null);
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    expect(res.status).toBe(404);
  });

  it("returns 404 when examMode is 'none'", async () => {
    rawQueryOneMock.mockResolvedValue({ groupId: "g-1", instructorId: "i-1", examMode: "none", anonymousLeaderboard: 0 });
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    expect(res.status).toBe(404);
  });

  it("returns 403 when student is not enrolled and has no access token", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    rawQueryOneMock
      .mockResolvedValueOnce({ groupId: "g-1", instructorId: "inst-1", examMode: "scheduled", anonymousLeaderboard: 0 })
      .mockResolvedValueOnce(null);
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    expect(res.status).toBe(403);
  });

  it("returns leaderboard for admin with full userId in entries", async () => {
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.entries[0].userId).toBe("student-1");
  });

  it("strips userId from entries for enrolled students", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    rawQueryOneMock
      .mockResolvedValueOnce({ groupId: "g-1", instructorId: "inst-1", examMode: "scheduled", anonymousLeaderboard: 0 })
      .mockResolvedValueOnce({ one: 1 });
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.entries[0].userId).toBe("");
  });

  it("marks the current user's entry with isCurrentUser for students", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    rawQueryOneMock
      .mockResolvedValueOnce({ groupId: "g-1", instructorId: "inst-1", examMode: "scheduled", anonymousLeaderboard: 0 })
      .mockResolvedValueOnce({ one: 1 });
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    const body = await res.json();
    expect(body.data.entries[0].isCurrentUser).toBe(true);
  });

  it("returns problems list alongside leaderboard", async () => {
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    const body = await res.json();
    expect(body.data.problems).toEqual([{ id: "p-1", title: "Problem A" }]);
  });

  it("returns 500 on unexpected error", async () => {
    computeLeaderboardMock.mockRejectedValue(new Error("compute crash"));
    const res = await leaderboardGET(makeLeaderboardRequest(), { params: PARAMS() });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("internalServerError");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  getContestAssignmentMock,
  canManageContestMock,
  rawQueryOneMock,
  findManyMock,
  findFirstMock,
  insertValuesMock,
  insertReturningMock,
  updateSetMock,
  updateWhereMock,
  updateReturningMock,
  deleteWhereMock,
  deleteReturningMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(() => null),
  getContestAssignmentMock: vi.fn(),
  canManageContestMock: vi.fn(),
  rawQueryOneMock: vi.fn(),
  findManyMock: vi.fn(),
  findFirstMock: vi.fn(),
  insertValuesMock: vi.fn(),
  insertReturningMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  updateReturningMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  deleteReturningMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
  isAdmin: vi.fn(() => false),
  isInstructor: vi.fn(() => false),
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

vi.mock("@/lib/assignments/contests", () => ({
  getContestAssignment: getContestAssignmentMock,
  canManageContest: canManageContestMock,
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/security/sanitize-html", () => ({
  sanitizeMarkdown: vi.fn((value: string) => value.trim()),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      contestClarifications: {
        findMany: findManyMock,
        findFirst: findFirstMock,
      },
    },
    insert: vi.fn(() => ({
      values: insertValuesMock,
    })),
    update: vi.fn(() => ({
      set: updateSetMock,
    })),
    delete: vi.fn(() => ({
      where: deleteWhereMock,
    })),
  },
}));

insertValuesMock.mockReturnValue({ returning: insertReturningMock });
updateSetMock.mockReturnValue({ where: updateWhereMock });
updateWhereMock.mockReturnValue({ returning: updateReturningMock });
deleteWhereMock.mockReturnValue({ returning: deleteReturningMock });

const ADMIN_USER = {
  id: "admin-1",
  role: "admin",
  username: "admin",
  email: "admin@example.com",
  name: "Admin",
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
  groupId: "group-1",
  instructorId: "inst-1",
  examMode: "scheduled",
  enableAntiCheat: false,
  startsAt: null,
  deadline: null,
};

function withJson(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("contest clarifications routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockResolvedValue(null);
    getContestAssignmentMock.mockResolvedValue(CONTEST_ASSIGNMENT);
    canManageContestMock.mockResolvedValue(false);
    rawQueryOneMock.mockResolvedValue({ one: 1 });
    findManyMock.mockResolvedValue([
      {
        id: "clarification-1",
        assignmentId: "assign-1",
        problemId: "problem-1",
        userId: "student-1",
        question: "Is this 1-indexed?",
        answer: "Yes",
        answerType: "yes",
        answeredBy: "admin-1",
        answeredAt: new Date("2026-04-16T00:00:00.000Z"),
        isPublic: true,
        createdAt: new Date("2026-04-16T00:00:00.000Z"),
        updatedAt: new Date("2026-04-16T00:00:00.000Z"),
      },
    ]);
    findFirstMock.mockResolvedValue({
      id: "clarification-1",
      assignmentId: "assign-1",
      problemId: "problem-1",
      userId: "student-1",
      question: "Is this 1-indexed?",
      answer: null,
      answerType: null,
      answeredBy: null,
      answeredAt: null,
      isPublic: false,
      createdAt: new Date("2026-04-16T00:00:00.000Z"),
      updatedAt: new Date("2026-04-16T00:00:00.000Z"),
    });
    insertReturningMock.mockResolvedValue([
      {
        id: "clarification-1",
        assignmentId: "assign-1",
        problemId: "problem-1",
        userId: "student-1",
        question: "Is this 1-indexed?",
      },
    ]);
    updateReturningMock.mockResolvedValue([
      {
        id: "clarification-1",
        assignmentId: "assign-1",
        answer: "Yes",
        answerType: "yes",
        isPublic: true,
      },
    ]);
    deleteReturningMock.mockResolvedValue([{ id: "clarification-1" }]);
  });

  it("lists visible clarifications for a participant", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const { GET } = await import("@/app/api/v1/contests/[assignmentId]/clarifications/route");
    const response = await GET(withJson("GET", "http://localhost:3000/api/v1/contests/assign-1/clarifications"), {
      params: Promise.resolve({ assignmentId: "assign-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "clarification-1",
          question: "Is this 1-indexed?",
        }),
      ]),
    });
  });

  it("creates a clarification for a participant", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const { POST } = await import("@/app/api/v1/contests/[assignmentId]/clarifications/route");
    const response = await POST(
      withJson("POST", "http://localhost:3000/api/v1/contests/assign-1/clarifications", {
        problemId: "problem-1",
        question: "Is this 1-indexed?",
      }),
      { params: Promise.resolve({ assignmentId: "assign-1" }) }
    );

    expect(response.status).toBe(201);
    expect(insertValuesMock).toHaveBeenCalled();
  });

  it("answers a clarification for a contest manager", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    canManageContestMock.mockResolvedValue(true);
    const { PATCH } = await import("@/app/api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route");
    const response = await PATCH(
      withJson("PATCH", "http://localhost:3000/api/v1/contests/assign-1/clarifications/clarification-1", {
        answer: "Yes",
        answerType: "yes",
        isPublic: true,
      }),
      { params: Promise.resolve({ assignmentId: "assign-1", clarificationId: "clarification-1" }) }
    );

    expect(response.status).toBe(200);
    expect(updateSetMock).toHaveBeenCalled();
  });

  it("deletes a clarification for a contest manager", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    canManageContestMock.mockResolvedValue(true);
    const { DELETE } = await import("@/app/api/v1/contests/[assignmentId]/clarifications/[clarificationId]/route");
    const response = await DELETE(
      withJson("DELETE", "http://localhost:3000/api/v1/contests/assign-1/clarifications/clarification-1"),
      { params: Promise.resolve({ assignmentId: "assign-1", clarificationId: "clarification-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "clarification-1" } });
  });
});

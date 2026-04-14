import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any module imports
// ---------------------------------------------------------------------------
const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
  problemSetsFindFirstMock,
  createProblemSetMock,
  listVisibleProblemSetsForUserMock,
  resolveCapabilitiesMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  recordAuditEventMock: vi.fn(),
  problemSetsFindFirstMock: vi.fn(),
  createProblemSetMock: vi.fn(),
  listVisibleProblemSetsForUserMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  isInstructor: (role: string) =>
    role === "instructor" || role === "admin" || role === "super_admin",
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) =>
    NextResponse.json({ error: "notFound", resource }, { status: 404 }),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/security/constants", () => ({
  isUserRole: (role: string) =>
    ["student", "instructor", "admin", "super_admin"].includes(role),
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/problem-sets/management", () => ({
  createProblemSet: createProblemSetMock,
}));

vi.mock("@/lib/problem-sets/visibility", () => ({
  listVisibleProblemSetsForUser: listVisibleProblemSetsForUserMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problemSets: {
        findFirst: problemSetsFindFirstMock,
      },
    },
  },
}));

// Import handlers AFTER all mocks
import { GET, POST } from "@/app/api/v1/problem-sets/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest() {
  return new NextRequest("http://localhost:3000/api/v1/problem-sets", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/problem-sets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid",
    },
    body: JSON.stringify(body),
  });
}

const ADMIN_USER = { id: "admin-1", role: "admin", username: "admin" };
const INSTRUCTOR_USER = { id: "inst-1", role: "instructor", username: "instructor" };
const STUDENT_USER = { id: "student-1", role: "student", username: "student" };

const PROBLEM_SET = {
  id: "ps-1",
  name: "Exam Set 1",
  description: "First exam",
  createdAt: new Date(),
  problems: [{ problem: { id: "p-1", title: "Hello World" } }],
  groupAccess: [{ group: { id: "g-1", name: "CS101" } }],
  creator: { id: "inst-1", name: "Alice", username: "alice" },
};

const VALID_POST_BODY = {
  name: "New Problem Set",
  description: "A new set",
  problemIds: ["p-1", "p-2"],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  getApiUserMock.mockResolvedValue(ADMIN_USER);
  listVisibleProblemSetsForUserMock.mockResolvedValue([PROBLEM_SET]);
  problemSetsFindFirstMock.mockResolvedValue(PROBLEM_SET);
  createProblemSetMock.mockReturnValue("ps-1");
  resolveCapabilitiesMock.mockImplementation((role: string) => {
    const capabilityMap: Record<string, Set<string>> = {
      admin: new Set([
        "problem_sets.create",
        "problem_sets.edit",
        "problem_sets.delete",
        "problem_sets.assign_groups",
      ]),
      instructor: new Set([
        "problem_sets.create",
        "problem_sets.edit",
        "problem_sets.delete",
        "problem_sets.assign_groups",
      ]),
      student: new Set(),
    };
    return Promise.resolve(capabilityMap[role] ?? new Set());
  });
});

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/problem-sets", () => {
  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 for a student role", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns all problem sets for admin with nested relations", async () => {
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: "ps-1", name: "Exam Set 1" });
  });

  it("returns all problem sets for instructor", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });

  it("uses the shared visibility helper to load visible problem sets", async () => {
    await GET(makeGetRequest());

    expect(listVisibleProblemSetsForUserMock).toHaveBeenCalledOnce();
    expect(listVisibleProblemSetsForUserMock).toHaveBeenCalledWith(
      "admin-1",
      "admin",
      {}
    );
  });

  it("returns empty array when no problem sets exist", async () => {
    listVisibleProblemSetsForUserMock.mockResolvedValue([]);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns 500 on unexpected error", async () => {
    listVisibleProblemSetsForUserMock.mockRejectedValue(new Error("DB error"));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internalServerError");
  });
});

// ---------------------------------------------------------------------------
// POST tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/problem-sets", () => {
  it("returns 403 when CSRF check fails", async () => {
    csrfForbiddenMock.mockReturnValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    );

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    consumeApiRateLimitMock.mockReturnValue(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(429);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 for a student role", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("creates a problem set as instructor and returns 201", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: "ps-1", name: "Exam Set 1" });
    expect(createProblemSetMock).toHaveBeenCalledOnce();
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });

  it("creates a problem set as admin and returns 201", async () => {
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("ps-1");
  });

  it("returns 400 when name is empty", async () => {
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, name: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("problemSetNameRequired");
  });

  it("returns 400 when problemIds contains duplicates", async () => {
    const res = await POST(
      makePostRequest({ ...VALID_POST_BODY, problemIds: ["p-1", "p-1"] })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("problemSetProblemDuplicate");
  });

  it("records audit event with correct fields", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);

    await POST(makePostRequest(VALID_POST_BODY));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: INSTRUCTOR_USER.id,
        actorRole: INSTRUCTOR_USER.role,
        action: "problem_set.created",
        resourceType: "problem_set",
        resourceId: PROBLEM_SET.id,
        resourceLabel: PROBLEM_SET.name,
      })
    );
  });

  it("does not record audit event when findFirst returns null after creation", async () => {
    problemSetsFindFirstMock.mockResolvedValue(null);

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    createProblemSetMock.mockImplementation(() => {
      throw new Error("DB write failed");
    });

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internalServerError");
  });
});

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
  problemsFindFirstMock,
  dbSelectMock,
  createProblemWithTestCasesMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  recordAuditEventMock: vi.fn(),
  problemsFindFirstMock: vi.fn(),
  dbSelectMock: vi.fn(),
  createProblemWithTestCasesMock: vi.fn(),
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
  apiSuccess: (data: unknown, opts?: { status?: number; headers?: Record<string, string> }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200, headers: opts?.headers }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
  apiPaginated: (
    data: unknown[],
    page: number,
    limit: number,
    total: number
  ) =>
    NextResponse.json({ data, page, limit, total }),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
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

vi.mock("@/lib/problem-management", () => ({
  createProblemWithTestCases: createProblemWithTestCasesMock,
}));

vi.mock("@/lib/api/pagination", () => ({
  parsePagination: (_params: URLSearchParams) => ({ page: 1, limit: 20, offset: 0 }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: { findFirst: problemsFindFirstMock },
    },
    select: dbSelectMock,
  },
}));

// Import handlers AFTER all mocks are set up
import { GET, POST } from "@/app/api/v1/problems/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(search = "") {
  return new NextRequest(`http://localhost:3000/api/v1/problems${search}`, {
    method: "GET",
  });
}

function makePostRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/problems", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid",
    },
    body: JSON.stringify(body),
  });
}

/** Wire db.select().from().where().orderBy().limit().offset() chain */
function mockSelectChain(rows: unknown[], countRow = { count: rows.length }) {
  // select().from().where() → [countRow]
  // select().from().where().orderBy().limit().offset() → rows
  const offsetFn = vi.fn().mockResolvedValue(rows);
  const limitFn = vi.fn(() => ({ offset: offsetFn }));
  const orderByFn = vi.fn(() => ({ limit: limitFn }));
  const whereFn = vi.fn()
    .mockResolvedValueOnce([countRow])
    .mockReturnValueOnce({ orderBy: orderByFn });
  const fromFn = vi.fn(() => ({ where: whereFn }));
  dbSelectMock.mockReturnValue({ from: fromFn });
  return { whereFn, fromFn, orderByFn, limitFn, offsetFn };
}

const ADMIN_USER = { id: "admin-1", role: "admin", username: "admin" };
const INSTRUCTOR_USER = { id: "inst-1", role: "instructor", username: "instructor" };
const STUDENT_USER = { id: "student-1", role: "student", username: "student" };

const VALID_POST_BODY = {
  title: "My Problem",
  description: "A test problem",
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  visibility: "private",
  testCases: [{ input: "1\n", expectedOutput: "1\n", isVisible: false }],
};

const CREATED_PROBLEM = {
  id: "prob-1",
  title: "My Problem",
  visibility: "private",
  timeLimitMs: 2000,
  memoryLimitMb: 256,
  testCases: [{ id: "tc-1", input: "1\n", expectedOutput: "1\n", isVisible: false }],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  getApiUserMock.mockResolvedValue(ADMIN_USER);
  createProblemWithTestCasesMock.mockReturnValue("prob-1");
  problemsFindFirstMock.mockResolvedValue(CREATED_PROBLEM);

  // Default: select chain returns empty
  mockSelectChain([]);
});

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/problems", () => {
  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns paginated list for admin", async () => {
    const problems = [{ id: "p-1", title: "Problem 1" }];
    mockSelectChain(problems, { count: 1 });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(problems);
    expect(body.total).toBe(1);
  });

  it("returns paginated list for non-admin user", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    const problems = [{ id: "p-2", title: "Public Problem" }];

    // Non-admin uses a different query path with or/and conditions
    // We set up the chain for the count query and the data query
    const offsetFn = vi.fn().mockResolvedValue(problems);
    const limitFn = vi.fn(() => ({ offset: offsetFn }));
    const orderByFn = vi.fn(() => ({ limit: limitFn }));
    const whereFn = vi.fn()
      .mockResolvedValueOnce([{ count: 1 }])
      .mockReturnValueOnce({ orderBy: orderByFn });
    const fromFn = vi.fn(() => ({ where: whereFn }));
    dbSelectMock.mockReturnValue({ from: fromFn });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(problems);
  });

  it("returns 400 for invalid visibility parameter", async () => {
    const res = await GET(makeGetRequest("?visibility=invalid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidVisibility");
  });

  it("accepts valid visibility parameter 'public'", async () => {
    mockSelectChain([]);
    const res = await GET(makeGetRequest("?visibility=public"));
    expect(res.status).toBe(200);
  });

  it("accepts valid visibility parameter 'private'", async () => {
    mockSelectChain([]);
    const res = await GET(makeGetRequest("?visibility=private"));
    expect(res.status).toBe(200);
  });

  it("accepts valid visibility parameter 'hidden'", async () => {
    mockSelectChain([]);
    const res = await GET(makeGetRequest("?visibility=hidden"));
    expect(res.status).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    getApiUserMock.mockRejectedValue(new Error("DB error"));

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internalServerError");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST tests
// ---------------------------------------------------------------------------

describe("POST /api/v1/problems", () => {
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

  it("returns 403 when user is a student", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("creates a problem successfully as instructor and returns 201", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: "prob-1", title: "My Problem" });
    expect(createProblemWithTestCasesMock).toHaveBeenCalledOnce();
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });

  it("creates a problem successfully as admin and returns 201", async () => {
    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: "prob-1" });
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, title: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("titleRequired");
  });

  it("returns 400 when timeLimitMs is below minimum", async () => {
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, timeLimitMs: 50 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidTimeLimit");
  });

  it("returns 400 when memoryLimitMb is above maximum", async () => {
    const res = await POST(makePostRequest({ ...VALID_POST_BODY, memoryLimitMb: 9999 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalidMemoryLimit");
  });

  it("does not record audit event when problem findFirst returns null", async () => {
    problemsFindFirstMock.mockResolvedValue(null);

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(201);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("records audit event with correct fields", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);

    await POST(makePostRequest(VALID_POST_BODY));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: INSTRUCTOR_USER.id,
        actorRole: INSTRUCTOR_USER.role,
        action: "problem.created",
        resourceType: "problem",
        resourceId: CREATED_PROBLEM.id,
        resourceLabel: CREATED_PROBLEM.title,
      })
    );
  });

  it("returns 500 on unexpected error", async () => {
    createProblemWithTestCasesMock.mockImplementation(() => {
      throw new Error("DB write failed");
    });

    const res = await POST(makePostRequest(VALID_POST_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("createError");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

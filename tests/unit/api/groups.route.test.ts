import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
  groupsFindFirstMock,
  dbDeleteMock,
  dbSelectMock,
  loggerErrorMock,
} = vi.hoisted(() => {
  const dbDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const dbDeleteMock = vi.fn(() => ({ where: dbDeleteWhere }));

  const selectFrom = vi.fn();
  const dbSelectMock = vi.fn(() => ({ from: selectFrom }));

  return {
    getApiUserMock: vi.fn(),
    csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),          // null = no CSRF error
    consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),    // null = not rate-limited
    recordAuditEventMock: vi.fn(),
    groupsFindFirstMock: vi.fn(),
    dbDeleteMock,
    dbSelectMock,
    loggerErrorMock: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  notFound: (resource: string) =>
    new Response(JSON.stringify({ error: "notFound", resource }), { status: 404 }),
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

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      groups: {
        findFirst: groupsFindFirstMock,
      },
    },
    delete: dbDeleteMock,
    select: dbSelectMock,
  },
  execTransaction: vi.fn(async (fn: (tx: any) => unknown) => fn({
    select: dbSelectMock,
    delete: dbDeleteMock,
    execute: vi.fn().mockResolvedValue(undefined),
  })),
}));

// canAccessGroup is only used by GET/PATCH — stub it anyway so the module resolves
vi.mock("@/lib/auth/permissions", () => ({
  canAccessGroup: vi.fn().mockResolvedValue(true),
}));

// updateGroupSchema is used by PATCH — stub so the module resolves cleanly
vi.mock("@/lib/validators/groups", () => ({
  updateGroupSchema: {
    safeParse: vi.fn(() => ({ success: true, data: {} })),
  },
}));

// ---------------------------------------------------------------------------
// Import the route AFTER mocks are installed
// ---------------------------------------------------------------------------

import { DELETE } from "@/app/api/v1/groups/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method = "DELETE") {
  return new NextRequest("http://localhost:3000/api/v1/groups/test-group-id", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
    },
  });
}

const PARAMS = Promise.resolve({ id: "test-group-id" });

const ADMIN_USER = { id: "admin-1", role: "admin", username: "admin", name: "Admin", email: "admin@example.com", className: null, mustChangePassword: false };
const SUPER_ADMIN_USER = { ...ADMIN_USER, id: "super-1", role: "super_admin", username: "superadmin" };
const STUDENT_USER = { ...ADMIN_USER, id: "student-1", role: "student", username: "student" };
const INSTRUCTOR_USER = { ...ADMIN_USER, id: "instructor-1", role: "instructor", username: "instructor" };

const EXISTING_GROUP = {
  id: "test-group-id",
  name: "Test Group",
  description: "A test group",
  instructorId: "instructor-1",
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Wire db.select(...).from(...).innerJoin(...).where(...).then(...) chain */
function mockSubmissionCount(count: number, groupExists = true) {
  const thenFn = vi.fn((cb: (rows: Array<{ total: number }>) => unknown) =>
    Promise.resolve(cb([{ total: count }]))
  );
  const whereFn = vi.fn(() => ({ then: thenFn }));
  const innerJoinFn = vi.fn(() => ({ where: whereFn }));
  const fromFn = vi.fn(() => ({ innerJoin: innerJoinFn }));

  // Mock the transaction pattern: tx.select().from(groups).where().for("update").limit()
  const limitFn = vi.fn().mockResolvedValue(groupExists ? [EXISTING_GROUP] : []);
  const forFn = vi.fn(() => ({ limit: limitFn }));
  const whereGroupFn = vi.fn(() => ({ for: forFn }));

  // Track which select calls are for groups vs submissions
  let selectCallCount = 0;
  dbSelectMock.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount % 3 === 1) {
      // First call in transaction: groups check
      return { from: vi.fn(() => ({ where: whereGroupFn })) };
    }
    // Second call: submission count
    return { from: fromFn };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  groupsFindFirstMock.mockResolvedValue(EXISTING_GROUP);
  // default: no submissions → deletion allowed
  mockSubmissionCount(0);
  // default db.delete chain
  const whereFn = vi.fn().mockResolvedValue(undefined);
  dbDeleteMock.mockReturnValue({ where: whereFn });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — authorization guards", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 403 for a student role", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 403 for an instructor role", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("allows an admin to proceed past the role check", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    // Should not be 401 or 403 — group exists and no submissions
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("allows a super_admin to proceed past the role check", async () => {
    getApiUserMock.mockResolvedValue(SUPER_ADMIN_USER);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — CSRF and rate-limit guards", () => {
  it("returns 403 when CSRF validation fails", async () => {
    csrfForbiddenMock.mockReturnValue(
      NextResponse.json({ error: "forbidden" }, { status: 403 })
    );
    getApiUserMock.mockResolvedValue(ADMIN_USER);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    consumeApiRateLimitMock.mockReturnValue(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );
    getApiUserMock.mockResolvedValue(ADMIN_USER);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — group existence check", () => {
  it("returns 404 when the group does not exist", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    mockSubmissionCount(0, false); // group doesn't exist

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("notFound");
    expect(body.resource).toBe("Group");
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — deletion guard: active submissions", () => {
  it("returns 409 when the group has assignments with submissions", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    mockSubmissionCount(3);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("groupDeleteBlocked");
  });

  it("returns 409 even with a single submission", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    mockSubmissionCount(1);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(409);
  });

  it("allows deletion when there are assignments but zero submissions", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    mockSubmissionCount(0);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — successful deletion", () => {
  it("returns 200 with the deleted group id", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "test-group-id" });
  });

  it("calls db.delete on the groups table with the correct id", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    const whereFn = vi.fn().mockResolvedValue(undefined);
    dbDeleteMock.mockReturnValue({ where: whereFn });

    await DELETE(makeRequest(), { params: PARAMS });

    expect(dbDeleteMock).toHaveBeenCalledOnce();
    expect(whereFn).toHaveBeenCalledOnce();
  });

  it("records an audit event after successful deletion", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);

    await DELETE(makeRequest(), { params: PARAMS });

    expect(recordAuditEventMock).toHaveBeenCalledOnce();
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN_USER.id,
        actorRole: ADMIN_USER.role,
        action: "group.deleted",
        resourceType: "group",
        resourceId: EXISTING_GROUP.id,
        resourceLabel: EXISTING_GROUP.name,
      })
    );
  });

  it("includes the group archived status in the audit event details", async () => {
    getApiUserMock.mockResolvedValue(SUPER_ADMIN_USER);

    await DELETE(makeRequest(), { params: PARAMS });

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { isArchived: EXISTING_GROUP.isArchived },
      })
    );
  });

  it("does NOT record an audit event when deletion is blocked", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    mockSubmissionCount(5);

    await DELETE(makeRequest(), { params: PARAMS });

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — error handling", () => {
  it("returns 500 and logs an error when an unexpected exception is thrown", async () => {
    getApiUserMock.mockRejectedValue(new Error("DB connection lost"));

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internalServerError");
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });
});

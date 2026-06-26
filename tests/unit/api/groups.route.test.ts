import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  resolveCapabilitiesMock,
  canManageGroupResourcesAsyncMock,
  canManageGroupMembersAsyncMock,
  recordAuditEventMock,
  canAccessGroupMock,
  groupsFindFirstMock,
  enrollmentsFindManyMock,
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
    resolveCapabilitiesMock: vi.fn(),
    canManageGroupResourcesAsyncMock: vi.fn(),
    canManageGroupMembersAsyncMock: vi.fn(),
    recordAuditEventMock: vi.fn(),
    canAccessGroupMock: vi.fn(),
    groupsFindFirstMock: vi.fn(),
    enrollmentsFindManyMock: vi.fn(),
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

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/assignments/management", () => ({
  canManageGroupResourcesAsync: canManageGroupResourcesAsyncMock,
  canManageGroupMembersAsync: canManageGroupMembersAsyncMock,
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
      enrollments: {
        findMany: enrollmentsFindManyMock,
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
  canAccessGroup: canAccessGroupMock,
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

import { DELETE, GET } from "@/app/api/v1/groups/[id]/route";

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
  resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
  canManageGroupResourcesAsyncMock.mockResolvedValue(true);
  canManageGroupMembersAsyncMock.mockResolvedValue(false);
  canAccessGroupMock.mockResolvedValue(true);
  groupsFindFirstMock.mockResolvedValue(EXISTING_GROUP);
  // default: no submissions → deletion allowed
  mockSubmissionCount(0);
  // default db.delete chain
  const whereFn = vi.fn().mockResolvedValue(undefined);
  dbDeleteMock.mockReturnValue({ where: whereFn });
});

// ---------------------------------------------------------------------------
describe("GET /api/v1/groups/[id] — enrollment contract", () => {
  it("returns explicit enrollment metadata so the payload is not ambiguous", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    groupsFindFirstMock
      .mockResolvedValueOnce({ id: EXISTING_GROUP.id })
      .mockResolvedValueOnce({
        ...EXISTING_GROUP,
        instructor: {
          id: "instructor-1",
          name: "Instructor",
          email: "instructor@example.com",
        },
      });
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      })),
    });
    enrollmentsFindManyMock.mockResolvedValue([
      {
        id: "enrollment-1",
        userId: "student-1",
        groupId: EXISTING_GROUP.id,
        enrolledAt: new Date("2026-04-01T00:00:00Z"),
        user: {
          id: "student-1",
          name: "Student One",
          email: "student1@example.com",
        },
      },
      {
        id: "enrollment-2",
        userId: "student-2",
        groupId: EXISTING_GROUP.id,
        enrolledAt: new Date("2026-04-02T00:00:00Z"),
        user: {
          id: "student-2",
          name: "Student Two",
          email: "student2@example.com",
        },
      },
    ]);

    const res = await GET(makeRequest("GET"), { params: PARAMS });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.enrollmentsMeta).toEqual({
      page: 1,
      limit: 100,
      total: 2,
    });
    expect(body.data.memberCount).toBe(2);
  });

  it("shows member emails to a custom role that can manage the group", async () => {
    getApiUserMock.mockResolvedValue({
      id: "custom-manager",
      role: "custom_manager",
      username: "manager",
      email: "manager@example.com",
      name: "Manager",
      className: null,
      mustChangePassword: false,
    });
    canManageGroupResourcesAsyncMock.mockResolvedValueOnce(true);
    canManageGroupMembersAsyncMock.mockResolvedValueOnce(true);
    canAccessGroupMock.mockResolvedValueOnce(true);
    groupsFindFirstMock
      .mockResolvedValueOnce({ id: EXISTING_GROUP.id })
      .mockResolvedValueOnce({
        ...EXISTING_GROUP,
        instructor: {
          id: "instructor-1",
          name: "Instructor",
          email: "instructor@example.com",
        },
      });
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      })),
    });
    enrollmentsFindManyMock.mockResolvedValue([
      {
        id: "enrollment-1",
        userId: "student-1",
        groupId: EXISTING_GROUP.id,
        enrolledAt: new Date("2026-04-01T00:00:00Z"),
        user: {
          id: "student-1",
          name: "Student One",
          email: "student1@example.com",
        },
      },
    ]);

    const res = await GET(makeRequest("GET"), { params: PARAMS });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.instructor.email).toBe("instructor@example.com");
    expect(body.data.enrollments[0].user.email).toBe("student1@example.com");
  });

  it("returns 403 when the caller cannot access the group", async () => {
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    groupsFindFirstMock.mockResolvedValueOnce({ id: EXISTING_GROUP.id });
    canAccessGroupMock.mockResolvedValueOnce(false);

    const res = await GET(makeRequest("GET"), { params: PARAMS });

    expect(res.status).toBe(403);
  });

  it("hides the member roster from an enrolled non-manager (IDOR guard)", async () => {
    // Enrolled student CAN access the group but is NOT a manager — they must not
    // receive the per-member roster (co-candidate PII enumeration).
    getApiUserMock.mockResolvedValue(STUDENT_USER);
    canAccessGroupMock.mockResolvedValue(true);
    canManageGroupResourcesAsyncMock.mockResolvedValue(false);
    canManageGroupMembersAsyncMock.mockResolvedValue(false);
    groupsFindFirstMock
      .mockResolvedValueOnce({ id: EXISTING_GROUP.id })
      .mockResolvedValueOnce({
        ...EXISTING_GROUP,
        instructor: { id: "instructor-1", name: "Instructor", email: "instructor@example.com" },
      });
    dbSelectMock.mockReturnValueOnce({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ count: 2 }]) })),
    });
    // If the route ever queried enrollments for a non-manager, this would leak.
    enrollmentsFindManyMock.mockResolvedValue([
      { id: "e1", userId: "other", groupId: EXISTING_GROUP.id, enrolledAt: new Date(), user: { id: "other", name: "Other", email: "other@example.com" } },
    ]);

    const res = await GET(makeRequest("GET"), { params: PARAMS });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.enrollments).toEqual([]);
    expect(enrollmentsFindManyMock).not.toHaveBeenCalled();
    // memberCount (a non-PII aggregate) is still available.
    expect(body.data.memberCount).toBe(2);
  });
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
    resolveCapabilitiesMock.mockResolvedValue(new Set());

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns 403 for an instructor role", async () => {
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set());

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("allows an admin to proceed past the role check", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));

    const res = await DELETE(makeRequest(), { params: PARAMS });
    // Should not be 401 or 403 — group exists and no submissions
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("allows a super_admin to proceed past the role check", async () => {
    getApiUserMock.mockResolvedValue(SUPER_ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));

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
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limited", async () => {
    consumeApiRateLimitMock.mockReturnValue(
      NextResponse.json({ error: "rateLimited" }, { status: 429 })
    );
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — group existence check", () => {
  it("returns 404 when the group does not exist", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
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
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
    mockSubmissionCount(3);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("groupDeleteBlocked");
  });

  it("returns 409 even with a single submission", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
    mockSubmissionCount(1);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(409);
  });

  it("allows deletion when there are assignments but zero submissions", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
    mockSubmissionCount(0);

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — successful deletion", () => {
  it("returns 200 with the deleted group id", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));

    const res = await DELETE(makeRequest(), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "test-group-id" });
  });

  it("calls db.delete on the groups table with the correct id", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
    const whereFn = vi.fn().mockResolvedValue(undefined);
    dbDeleteMock.mockReturnValue({ where: whereFn });

    await DELETE(makeRequest(), { params: PARAMS });

    expect(dbDeleteMock).toHaveBeenCalledOnce();
    expect(whereFn).toHaveBeenCalledOnce();
  });

  it("records an audit event after successful deletion", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));

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
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));

    await DELETE(makeRequest(), { params: PARAMS });

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { isArchived: EXISTING_GROUP.isArchived },
      })
    );
  });

  it("does NOT record an audit event when deletion is blocked", async () => {
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
    mockSubmissionCount(5);

    await DELETE(makeRequest(), { params: PARAMS });

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

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

// ---------------------------------------------------------------------------
describe("DELETE /api/v1/groups/[id] — resource-scope IDOR guard", () => {
  it("denies a groups.delete holder who is not the owner/co-instructor and lacks groups.view_all", async () => {
    // Another instructor who holds groups.delete but has no relationship to
    // this group and no org-wide groups.view_all capability. The capability
    // gate passes, but canManageGroupResourcesAsync must reject (IDOR).
    getApiUserMock.mockResolvedValue({ ...INSTRUCTOR_USER, id: "other-instructor" });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
    canManageGroupResourcesAsyncMock.mockResolvedValue(false);

    const res = await DELETE(makeRequest(), { params: PARAMS });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    // The group row must not be deleted when authorization fails.
    expect(dbDeleteMock).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("allows the group owner to delete their own group", async () => {
    // INSTRUCTOR_USER.id === EXISTING_GROUP.instructorId ("instructor-1").
    getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete"]));
    canManageGroupResourcesAsyncMock.mockResolvedValue(true);

    const res = await DELETE(makeRequest(), { params: PARAMS });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "test-group-id" });
  });

  it("allows a groups.view_all holder even when canManageGroupResourcesAsync is false", async () => {
    // Org-wide admin bypass: groups.view_all capability short-circuits the
    // resource-scope check (mirrors the GET/PATCH pattern).
    getApiUserMock.mockResolvedValue({ ...INSTRUCTOR_USER, id: "other-instructor" });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["groups.delete", "groups.view_all"]));
    canManageGroupResourcesAsyncMock.mockResolvedValue(false);

    const res = await DELETE(makeRequest(), { params: PARAMS });

    expect(res.status).toBe(200);
  });
});

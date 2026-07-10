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
  canManageGroupResourcesAsyncMock,
  groupsFindFirstMock,
  usersFindFirstMock,
  getRoleLevelMock,
  dbSelectMock,
  dbInsertMock,
  dbUpdateMock,
  dbDeleteMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => NextResponse | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  recordAuditEventMock: vi.fn(),
  canManageGroupResourcesAsyncMock: vi.fn(),
  groupsFindFirstMock: vi.fn(),
  usersFindFirstMock: vi.fn(),
  getRoleLevelMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbDeleteMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

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

vi.mock("@/lib/assignments/management", () => ({
  canManageGroupResourcesAsync: canManageGroupResourcesAsyncMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  getRoleLevel: getRoleLevelMock,
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
      groups: { findFirst: groupsFindFirstMock },
      users: { findFirst: usersFindFirstMock },
    },
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
  },
}));

// Import handlers AFTER mocks are installed
import { POST } from "@/app/api/v1/groups/[id]/instructors/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostRequest(body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/v1/groups/test-group-id/instructors",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "valid-token",
      },
      body: JSON.stringify(body),
    }
  );
}

const PARAMS = Promise.resolve({ id: "test-group-id" });

const INSTRUCTOR_USER = {
  id: "instructor-1",
  role: "instructor",
  username: "instructor",
  name: "Instructor",
  email: "instructor@example.com",
  className: null,
  mustChangePassword: false,
};

const GROUP = { id: "test-group-id", instructorId: "instructor-1" };

beforeEach(() => {
  vi.clearAllMocks();
  csrfForbiddenMock.mockReturnValue(null);
  consumeApiRateLimitMock.mockReturnValue(null);
  getApiUserMock.mockResolvedValue(INSTRUCTOR_USER);
  canManageGroupResourcesAsyncMock.mockResolvedValue(true);
  groupsFindFirstMock.mockResolvedValue(GROUP);
  usersFindFirstMock.mockResolvedValue({
    id: "target-1",
    isActive: true,
    role: "instructor",
  });
  // Default target role is a valid instructor-level role.
  getRoleLevelMock.mockResolvedValue(2);
  // existing-instructor lookup returns empty (not yet assigned)
  dbSelectMock.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
    })),
  });
  // Atomic upsert chain: insert().values().onConflictDoUpdate().returning().
  // `inserted: true` = fresh row (201 added); false = conflict-update (200).
  dbInsertMock.mockReturnValue({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ inserted: true }]),
      })),
    })),
  });
  dbUpdateMock.mockReturnValue({
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  });
  dbDeleteMock.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
});

// ---------------------------------------------------------------------------
// POST — student-target escalation guard (AGG-5 / SEC-3)
// ---------------------------------------------------------------------------

describe("POST /api/v1/groups/[id]/instructors — target role guard", () => {
  it("rejects a student-level target with 409 instructorRoleInvalid", async () => {
    // Student role has level 0 — must never be elevated to co_instructor/ta.
    getRoleLevelMock.mockResolvedValue(0);

    const res = await POST(
      makePostRequest({ userId: "target-1", role: "co_instructor" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("instructorRoleInvalid");
    expect(dbInsertMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
    // The role-level gate is the source of truth — verify it was consulted.
    expect(getRoleLevelMock).toHaveBeenCalledWith("instructor");
  });

  it("accepts a valid instructor-level target and assigns the role", async () => {
    getRoleLevelMock.mockResolvedValue(2);

    const res = await POST(
      makePostRequest({ userId: "target-1", role: "co_instructor" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ added: true, role: "co_instructor" });
    expect(dbInsertMock).toHaveBeenCalledOnce();
  });

  it("updates an existing instructor assignment instead of inserting", async () => {
    getRoleLevelMock.mockResolvedValue(2);
    // Conflict-update path: the upsert reports the row pre-existed.
    dbInsertMock.mockReturnValue({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ inserted: false }]),
        })),
      })),
    });

    const res = await POST(
      makePostRequest({ userId: "target-1", role: "ta" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ updated: true, role: "ta" });
    expect(dbInsertMock).toHaveBeenCalledOnce();
  });

  it("returns 404 when the target user does not exist", async () => {
    usersFindFirstMock.mockResolvedValue(null);

    const res = await POST(
      makePostRequest({ userId: "missing", role: "co_instructor" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("userNotFound");
  });

  it("returns 403 when the caller cannot manage the group", async () => {
    canManageGroupResourcesAsyncMock.mockResolvedValue(false);

    const res = await POST(
      makePostRequest({ userId: "target-1", role: "co_instructor" }),
      { params: PARAMS }
    );

    expect(res.status).toBe(403);
    expect(getRoleLevelMock).not.toHaveBeenCalled();
  });
});

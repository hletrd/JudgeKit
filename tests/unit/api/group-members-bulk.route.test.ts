import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  canManageGroupMembersAsyncMock,
  recordAuditEventMock,
  consumeApiRateLimitMock,
  getApiUserMock,
  groupsFindFirstMock,
  usersFindManyMock,
  enrollmentsFindManyMock,
  insertReturningMock,
} = vi.hoisted(() => ({
  canManageGroupMembersAsyncMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  getApiUserMock: vi.fn(),
  groupsFindFirstMock: vi.fn(),
  usersFindManyMock: vi.fn(),
  enrollmentsFindManyMock: vi.fn(),
  insertReturningMock: vi.fn(),
}));

vi.mock("@/lib/assignments/management", () => ({
  canManageGroupMembersAsync: canManageGroupMembersAsyncMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  csrfForbidden: vi.fn(() => null),
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  isInstructor: (role: string) => role === "instructor" || role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      groups: {
        findFirst: groupsFindFirstMock,
      },
      users: {
        findMany: usersFindManyMock,
      },
      enrollments: {
        findMany: enrollmentsFindManyMock,
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: insertReturningMock,
        })),
      })),
    })),
  },
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/groups/group-1/members/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/groups/[id]/members/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockResolvedValue(null);
    getApiUserMock.mockResolvedValue({
      id: "instructor-1",
      role: "instructor",
      username: "instructor",
      email: "instructor@example.com",
      name: "Instructor",
      className: null,
      mustChangePassword: false,
    });
    groupsFindFirstMock.mockResolvedValue({ id: "group-1", instructorId: "instructor-1" });
    canManageGroupMembersAsyncMock.mockResolvedValue(true);
    enrollmentsFindManyMock.mockResolvedValue([]);
    insertReturningMock.mockResolvedValue([]);
  });

  it("counts skipped users from duplicate requests, invalid ids, and insert conflicts", async () => {
    usersFindManyMock.mockResolvedValue([
      { id: "student-1", username: "student1" },
      { id: "student-2", username: "student2" },
    ]);
    insertReturningMock.mockResolvedValue([{ id: "enrollment-1" }]);

    const { POST } = await import("@/app/api/v1/groups/[id]/members/bulk/route");
    const res = await POST(makeRequest({ userIds: ["student-1", "student-1", "student-2", "missing"] }), {
      params: Promise.resolve({ id: "group-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ enrolled: 1, skipped: 3 });
  });

  it("skips the full request when no valid students remain after validation", async () => {
    usersFindManyMock.mockResolvedValue([]);

    const { POST } = await import("@/app/api/v1/groups/[id]/members/bulk/route");
    const res = await POST(makeRequest({ userIds: ["missing-1", "missing-2"] }), {
      params: Promise.resolve({ id: "group-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ enrolled: 0, skipped: 2 });
  });
});

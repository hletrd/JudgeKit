import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  canModerateDiscussionsMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  canModerateDiscussionsMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
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

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/discussions/permissions", () => ({
  canModerateDiscussions: canModerateDiscussionsMock,
}));

const threadFindFirstMock = vi.fn();
const updateSetMock = vi.fn();
const updateWhereMock = vi.fn();
const updateReturningMock = vi.fn();
const deleteWhereMock = vi.fn();
vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      discussionThreads: {
        findFirst: threadFindFirstMock,
      },
    },
    update: vi.fn(() => ({ set: updateSetMock })),
    delete: vi.fn(() => ({ where: deleteWhereMock })),
  },
}));
updateSetMock.mockReturnValue({ where: updateWhereMock });
updateWhereMock.mockReturnValue({ returning: updateReturningMock });

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

describe("community thread moderation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockResolvedValue(null);
    getApiUserMock.mockResolvedValue({
      id: "staff-1",
      role: "admin",
      username: "admin",
      email: "admin@example.com",
      name: "Admin",
      className: null,
      mustChangePassword: false,
    });
    canModerateDiscussionsMock.mockResolvedValue(true);
    threadFindFirstMock.mockResolvedValue({
      id: "thread-1",
      title: "Need help",
      lockedAt: null,
      pinnedAt: null,
    });
    updateReturningMock.mockResolvedValue([
      {
        id: "thread-1",
        lockedAt: new Date(),
        pinnedAt: null,
      },
    ]);
    deleteWhereMock.mockResolvedValue(undefined);
  });

  it("allows moderators to lock a thread", async () => {
    const { PATCH } = await import("@/app/api/v1/community/threads/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/threads/thread-1", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ locked: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "thread-1" }) });
    expect(response.status).toBe(200);
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });

  it("allows moderators to delete a thread", async () => {
    const { DELETE } = await import("@/app/api/v1/community/threads/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/threads/thread-1", {
      method: "DELETE",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "thread-1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "thread-1" } });
  });
});

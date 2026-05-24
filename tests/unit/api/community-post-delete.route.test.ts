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
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/discussions/permissions", () => ({
  canModerateDiscussions: canModerateDiscussionsMock,
}));

const postFindFirstMock = vi.fn();
const deleteWhereMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      discussionPosts: {
        findFirst: postFindFirstMock,
      },
    },
    delete: vi.fn(() => ({ where: deleteWhereMock })),
  },
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

describe("community post delete route", () => {
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
    postFindFirstMock.mockResolvedValue({
      id: "post-1",
      threadId: "thread-1",
    });
    deleteWhereMock.mockResolvedValue(undefined);
  });

  it("allows moderators to delete a reply", async () => {
    const { DELETE } = await import("@/app/api/v1/community/posts/[id]/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/posts/post-1", {
      method: "DELETE",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "post-1" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "post-1" } });
  });
});

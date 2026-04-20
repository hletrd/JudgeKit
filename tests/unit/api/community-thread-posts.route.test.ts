import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
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

const threadFindFirstMock = vi.fn();
const txInsertValuesMock = vi.fn();
const txInsertReturningMock = vi.fn();
const txUpdateWhereMock = vi.fn();
const txUpdateSetMock = vi.fn(() => ({ where: txUpdateWhereMock }));
const txInsertMock = vi.fn(() => ({ values: txInsertValuesMock }));
const txUpdateMock = vi.fn(() => ({ set: txUpdateSetMock }));
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
    transaction: vi.fn(async (callback: any) => callback({
      insert: txInsertMock,
      update: txUpdateMock,
    })),
  },
}));
txInsertValuesMock.mockReturnValue({ returning: txInsertReturningMock });

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: vi.fn(async () => true),
}));

vi.mock("@/lib/security/sanitize-html", () => ({
  sanitizeMarkdown: vi.fn((s: string) => s),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

describe("POST /api/v1/community/threads/[id]/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockResolvedValue(null);
    getApiUserMock.mockResolvedValue({
      id: "user-1",
      role: "student",
      username: "user",
      email: "u@example.com",
      name: "User",
      className: null,
      mustChangePassword: false,
    });
    threadFindFirstMock.mockResolvedValue({
      id: "thread-1",
      title: "Need help",
      scopeType: "general",
      problemId: null,
      lockedAt: null,
    });
    txInsertReturningMock.mockResolvedValue([
      {
        id: "post-1",
        threadId: "thread-1",
        content: "Reply body",
      },
    ]);
  });

  it("creates a reply for an authenticated user", async () => {
    const { POST } = await import("@/app/api/v1/community/threads/[id]/posts/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/threads/thread-1/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ content: "Reply body" }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "thread-1" }) });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "post-1",
        threadId: "thread-1",
        content: "Reply body",
      },
    });
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });

  it("rejects replies to locked threads", async () => {
    threadFindFirstMock.mockResolvedValue({
      id: "thread-1",
      title: "Need help",
      scopeType: "general",
      problemId: null,
      lockedAt: new Date(),
    });

    const { POST } = await import("@/app/api/v1/community/threads/[id]/posts/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/threads/thread-1/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ content: "Reply body" }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: "thread-1" }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "discussionThreadLocked" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
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

const problemsFindFirstMock = vi.fn();
const insertValuesMock = vi.fn();
const insertReturningMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: {
        findFirst: problemsFindFirstMock,
      },
    },
    insert: vi.fn(() => ({
      values: insertValuesMock,
    })),
  },
}));
insertValuesMock.mockReturnValue({ returning: insertReturningMock });

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: vi.fn(async () => true),
}));

vi.mock("@/lib/capabilities", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
  hasCapability: (caps: Set<string>, capability: string) => caps.has(capability),
}));

vi.mock("@/lib/security/sanitize-html", () => ({
  sanitizeMarkdown: vi.fn((s: string) => s),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

describe("POST /api/v1/community/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeApiRateLimitMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockImplementation((role: string) =>
      Promise.resolve(new Set(role === "instructor" ? ["community.moderate"] : []))
    );
    getApiUserMock.mockResolvedValue({
      id: "user-1",
      role: "student",
      username: "user",
      email: "u@example.com",
      name: "User",
      className: null,
      mustChangePassword: false,
    });
    insertReturningMock.mockResolvedValue([
      {
        id: "thread-1",
        scopeType: "general",
        problemId: null,
        title: "Need help",
        content: "Question body",
      },
    ]);
  });

  it("creates a general thread for an authenticated user", async () => {
    const { POST } = await import("@/app/api/v1/community/threads/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        scopeType: "general",
        title: "Need help",
        content: "Question body",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "thread-1",
        scopeType: "general",
        problemId: null,
        title: "Need help",
        content: "Question body",
      },
    });
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
  });

  it("allows instructors to create editorial threads for a problem", async () => {
    getApiUserMock.mockResolvedValue({
      id: "inst-1",
      role: "instructor",
      username: "inst",
      email: "i@example.com",
      name: "Instructor",
      className: null,
      mustChangePassword: false,
    });
    problemsFindFirstMock.mockResolvedValue({ id: "problem-1" });
    insertReturningMock.mockResolvedValue([
      {
        id: "thread-2",
        scopeType: "editorial",
        problemId: "problem-1",
        title: "Editorial",
        content: "Use prefix sums",
      },
    ]);

    const { POST } = await import("@/app/api/v1/community/threads/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        scopeType: "editorial",
        problemId: "problem-1",
        title: "Editorial",
        content: "Use prefix sums",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });
});

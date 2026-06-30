import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  findManyMock,
  rawQueryAllMock,
  rawQueryOneMock,
  resolveCapabilitiesMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  rawQueryAllMock: vi.fn(),
  rawQueryOneMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any }) => Promise<Response> }) =>
    async (req: NextRequest) =>
      handler(req, {
        user: { id: "admin-1", role: "admin", username: "admin" },
      }),
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      chatMessages: {
        findMany: findManyMock,
      },
    },
  },
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryAll: rawQueryAllMock,
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/db/schema", () => ({
  chatMessages: {
    sessionId: "chatMessages.sessionId",
    userId: "chatMessages.userId",
    problemId: "chatMessages.problemId",
    provider: "chatMessages.provider",
    model: "chatMessages.model",
    content: "chatMessages.content",
    createdAt: "chatMessages.createdAt",
  },
  users: {
    id: "users.id",
    name: "users.name",
    username: "users.username",
  },
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq: vi.fn((_field: unknown, value: unknown) => ({ _eq: value })),
    and: vi.fn((...args: unknown[]) => ({ _and: args })),
    asc: vi.fn((value: unknown) => ({ _asc: value })),
    desc: vi.fn((value: unknown) => ({ _desc: value })),
    sql: Object.assign(
      (strings: TemplateStringsArray) => strings.join("?"),
      { raw: vi.fn((value: string) => value) }
    ),
  };
});

function makeCapabilities(canView: boolean) {
  return {
    has: (capability: string) => canView && capability === "system.chat_logs",
  };
}

describe("GET /api/v1/admin/chat-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveCapabilitiesMock.mockResolvedValue(makeCapabilities(true));
  });

  it("records an audit event when listing chat-log sessions", async () => {
    rawQueryAllMock.mockResolvedValue([
      {
        sessionId: "session-1",
        userId: "user-1",
        problemId: "problem-1",
        provider: "openai",
        model: "gpt",
        messageCount: 2,
        firstMessage: "hello",
        startedAt: "2026-04-12T00:00:00Z",
        lastMessageAt: "2026-04-12T00:05:00Z",
        userName: "Candidate",
        username: "candidate",
        total: 1,
      },
    ]);

    const { GET } = await import("@/app/api/v1/admin/chat-logs/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/chat-logs?page=1"), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(rawQueryAllMock).toHaveBeenCalledOnce();
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "chat_log.list_viewed",
        resourceType: "chat_log",
        actorId: "admin-1",
      })
    );
  });

  it("records an audit event when viewing a specific chat session transcript", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "msg-1",
        sessionId: "session-1",
        role: "user",
        content: "hello",
        user: { id: "user-1", name: "Candidate", username: "candidate" },
      },
    ]);

    const { GET } = await import("@/app/api/v1/admin/chat-logs/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/chat-logs?sessionId=session-1"), { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.messages).toHaveLength(1);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "chat_log.session_viewed",
        resourceType: "chat_session",
        resourceId: "session-1",
      })
    );
  });

  it("rejects callers without chat-log capability", async () => {
    resolveCapabilitiesMock.mockResolvedValueOnce(makeCapabilities(false));

    const { GET } = await import("@/app/api/v1/admin/chat-logs/route");
    const res = await GET(new NextRequest("http://localhost/api/v1/admin/chat-logs"), { params: Promise.resolve({}) });

    expect(res.status).toBe(403);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

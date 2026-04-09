import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  recordAuditEventMock,
  execTransactionMock,
  validateAndHashPasswordMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  execTransactionMock: vi.fn(),
  validateAndHashPasswordMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ handler }: { handler: (req: NextRequest, ctx: { user: any; body: unknown; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest) => handler(req, {
      user: await getApiUserMock(),
      body: undefined as never,
      params: {},
    }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  isInstructor: (role: string) => role === "instructor" || role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/api/responses", () => ({
  apiError: (error: string, status: number) => new Response(JSON.stringify({ error }), { status }),
}));

vi.mock("@/lib/db", () => ({
  execTransaction: execTransactionMock,
}));

vi.mock("@/lib/db/schema", () => ({
  users: { id: "users.id" },
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/users/core", () => ({
  validateRoleChange: vi.fn(() => null),
  validateAndHashPassword: validateAndHashPasswordMock,
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/users/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/users/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      username: "admin",
      email: "admin@example.com",
      name: "Admin",
      className: null,
      mustChangePassword: false,
    });
    validateAndHashPasswordMock.mockResolvedValue({ hash: "hashed" });
    execTransactionMock.mockImplementation(async (callback: (tx: {
      execute: (query: unknown) => Promise<void>;
      insert: (table: unknown) => { values: (value: unknown) => Promise<void> };
    }) => Promise<void>) =>
      callback({
        execute: async () => undefined,
        insert: () => ({
          values: async () => undefined,
        }),
      })
    );
  });

  it("requires caller-supplied passwords in the CSV payload", async () => {
    const { POST } = await import("@/app/api/v1/users/bulk/route");
    const res = await POST(makeRequest({
      users: [{ username: "student1", name: "Student One" }],
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("does not return plaintext passwords on success", async () => {
    const { POST } = await import("@/app/api/v1/users/bulk/route");
    const res = await POST(makeRequest({
      users: [{ username: "student1", name: "Student One", password: "StrongPass123!" }],
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.created[0]).toMatchObject({ username: "student1", name: "Student One" });
    expect(body.created[0].generatedPassword).toBeUndefined();
  });
});

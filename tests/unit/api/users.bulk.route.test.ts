import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  recordAuditEventMock,
  execTransactionMock,
  validateAndHashPasswordMock,
  validateRoleChangeAsyncMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  execTransactionMock: vi.fn(),
  validateAndHashPasswordMock: vi.fn(),
  validateRoleChangeAsyncMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/api/handler", () => ({
  createApiHandler:
    ({ schema, handler }: { schema?: { safeParse: (input: unknown) => { success: true; data: unknown } | { success: false; error: { issues?: Array<{ message?: string }> } } }; handler: (req: NextRequest, ctx: { user: any; body: unknown; params: Record<string, string> }) => Promise<Response> }) =>
    async (req: NextRequest) => {
      let body: unknown = undefined;
      if (schema) {
        body = await req.json();
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.issues?.[0]?.message ?? "validationError" }), { status: 400 });
        }
        body = parsed.data;
      }
      return handler(req, {
        user: await getApiUserMock(),
        body,
        params: {},
      });
    },
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
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

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/users/core", () => ({
  validateRoleChangeAsync: validateRoleChangeAsyncMock,
  validateAndHashPassword: validateAndHashPasswordMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
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
    resolveCapabilitiesMock.mockResolvedValue(new Set(["users.create"]));
    validateRoleChangeAsyncMock.mockResolvedValue(null);
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

  it("allows a custom role with users.create to bulk create users", async () => {
    getApiUserMock.mockResolvedValue({
      id: "custom-1",
      role: "custom_creator",
      username: "custom",
      email: "custom@example.com",
      name: "Custom",
      className: null,
      mustChangePassword: false,
    });
    resolveCapabilitiesMock.mockResolvedValue(new Set(["users.create"]));

    const { POST } = await import("@/app/api/v1/users/bulk/route");
    const res = await POST(makeRequest({
      users: [{ username: "student2", name: "Student Two", password: "StrongPass123!" }],
    }));

    expect(res.status).toBe(201);
  });

  it("rejects instructors who lack users.create instead of applying a built-in shortcut", async () => {
    getApiUserMock.mockResolvedValue({
      id: "instructor-1",
      role: "instructor",
      username: "instructor",
      email: "instructor@example.com",
      name: "Instructor",
      className: null,
      mustChangePassword: false,
    });
    resolveCapabilitiesMock.mockResolvedValue(new Set());

    const { POST } = await import("@/app/api/v1/users/bulk/route");
    const res = await POST(makeRequest({
      users: [{ username: "student2", name: "Student Two", password: "StrongPass123!" }],
    }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("allows assigning a valid custom role during bulk creation", async () => {
    validateRoleChangeAsyncMock.mockResolvedValue(null);

    const inserted: Array<Record<string, unknown>> = [];
    execTransactionMock.mockImplementation(async (callback: (tx: {
      execute: (query: unknown) => Promise<void>;
      insert: (table: unknown) => { values: (value: Record<string, unknown>) => Promise<void> };
    }) => Promise<void>) =>
      callback({
        execute: async () => undefined,
        insert: () => ({
          values: async (value) => {
            inserted.push(value);
          },
        }),
      })
    );

    const { POST } = await import("@/app/api/v1/users/bulk/route");
    const res = await POST(makeRequest({
      users: [{ username: "reviewer1", name: "Reviewer One", password: "StrongPass123!", role: "custom_reviewer" }],
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(inserted[0]?.role).toBe("custom_reviewer");
    expect(body.created[0]).toMatchObject({ username: "reviewer1", name: "Reviewer One" });
  });

  it("keeps valid rows when another row requests a disallowed role", async () => {
    validateRoleChangeAsyncMock.mockImplementation(async (_actorRole: string, requestedRole: string) =>
      requestedRole === "super_admin" ? "roleNameExists" : null
    );

    const { POST } = await import("@/app/api/v1/users/bulk/route");
    const res = await POST(makeRequest({
      users: [
        { username: "student-ok", name: "Student Ok", password: "StrongPass123!", role: "student" },
        { username: "student-bad", name: "Student Bad", password: "StrongPass123!", role: "super_admin" },
      ],
    }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.created).toEqual([{ username: "student-ok", name: "Student Ok" }]);
    expect(body.failed).toEqual([{ username: "student-bad", reason: "roleNameExists" }]);
  });
});

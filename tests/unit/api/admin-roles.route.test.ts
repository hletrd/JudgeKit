import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  resolveCapabilitiesMock,
  execTransactionMock,
  dbSelectMock,
  recordAuditEventMock,
  invalidateRoleCacheMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  execTransactionMock: vi.fn(),
  dbSelectMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  invalidateRoleCacheMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  csrfForbidden: vi.fn(() => null),
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
  isInstructor: (role: string) => role === "instructor" || role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
  invalidateRoleCache: invalidateRoleCacheMock,
  isSuperAdminRole: vi.fn(async (role: string) => role === "super_admin"),
  getRoleLevel: vi.fn(async (role: string) => {
    const levels: Record<string, number> = {
      student: 0, assistant: 1, instructor: 2, admin: 3, super_admin: 4,
    };
    return levels[role] ?? -1;
  }),
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
  execTransaction: execTransactionMock,
}));

function makeRequest(body: unknown, options?: { method?: string; url?: string }) {
  return new NextRequest(options?.url ?? "http://localhost:3000/api/v1/admin/roles", {
    method: options?.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/admin/roles", () => {
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
    resolveCapabilitiesMock.mockResolvedValue(new Set(["users.manage_roles"]));
  });

  it("returns 409 when a concurrent insert hits the unique role name constraint", async () => {
    execTransactionMock.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn().mockRejectedValue({ code: "23505" }),
        })),
      };
      return fn(tx);
    });

    const { POST } = await import("@/app/api/v1/admin/roles/route");
    const res = await POST(
      makeRequest({
        name: "reviewer_plus",
        displayName: "Reviewer+",
        description: "Can review",
        level: 1,
        capabilities: ["submissions.view_all"],
      }),
      { params: Promise.resolve({}) }
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("roleNameExists");
  });

  it("invalidates the role cache after a successful create", async () => {
    execTransactionMock.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn().mockResolvedValue(undefined),
        })),
      };
      return fn(tx);
    });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            id: "role-1",
            name: "reviewer_plus",
            displayName: "Reviewer+",
            description: "Can review",
            isBuiltin: false,
            level: 1,
            capabilities: ["submissions.view_all"],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      })),
    });

    const { POST } = await import("@/app/api/v1/admin/roles/route");
    const res = await POST(
      makeRequest({
        name: "reviewer_plus",
        displayName: "Reviewer+",
        description: "Can review",
        level: 1,
        capabilities: ["submissions.view_all"],
      }),
      { params: Promise.resolve({}) }
    );

    expect(res.status).toBe(201);
    expect(invalidateRoleCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/v1/admin/roles/[id]", () => {
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
    resolveCapabilitiesMock.mockResolvedValue(new Set(["users.manage_roles"]));
  });

  it("invalidates the role cache after a successful update", async () => {
    dbSelectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              id: "role-1",
              name: "reviewer_plus",
              displayName: "Reviewer+",
              description: "Can review",
              isBuiltin: false,
              level: 1,
              capabilities: ["submissions.view_all"],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              id: "role-1",
              name: "reviewer_plus",
              displayName: "Reviewer Updated",
              description: "Updated",
              isBuiltin: false,
              level: 1,
              capabilities: ["submissions.view_all"],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        })),
      });

    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn(() => ({ where: updateWhereMock }));
    const dbModule = await import("@/lib/db");
    (dbModule.db as any).update = vi.fn(() => ({ set: setMock }));

    const { PATCH } = await import("@/app/api/v1/admin/roles/[id]/route");
    const res = await PATCH(
      makeRequest(
        { displayName: "Reviewer Updated", description: "Updated" },
        { method: "PATCH", url: "http://localhost:3000/api/v1/admin/roles/role-1" }
      ),
      { params: Promise.resolve({ id: "role-1" }) }
    );

    expect(res.status).toBe(200);
    expect(invalidateRoleCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/v1/admin/roles/[id]", () => {
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
    resolveCapabilitiesMock.mockResolvedValue(new Set(["users.manage_roles"]));
  });

  it("returns 404 when the role disappears before the delete transaction locks it", async () => {
    execTransactionMock.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                for: vi.fn().mockResolvedValue([]),
              })),
            })),
          })),
        })),
      };
      return fn(tx);
    });

    const { DELETE } = await import("@/app/api/v1/admin/roles/[id]/route");
    const res = await DELETE(
      makeRequest({}, { method: "DELETE", url: "http://localhost:3000/api/v1/admin/roles/role-1" }),
      { params: Promise.resolve({ id: "role-1" }) }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("notFound");
  });

  it("invalidates the role cache after a successful delete", async () => {
    execTransactionMock.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const selectMock = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => ({
                for: vi.fn().mockResolvedValue([
                  {
                    id: "role-1",
                    name: "reviewer_plus",
                    displayName: "Reviewer+",
                    isBuiltin: false,
                  },
                ]),
              })),
            })),
          })),
        })
        .mockReturnValueOnce({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          })),
        });
      const tx = {
        select: selectMock,
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      };
      return fn(tx);
    });

    const { DELETE } = await import("@/app/api/v1/admin/roles/[id]/route");
    const res = await DELETE(
      makeRequest({}, { method: "DELETE", url: "http://localhost:3000/api/v1/admin/roles/role-1" }),
      { params: Promise.resolve({ id: "role-1" }) }
    );

    expect(res.status).toBe(200);
    expect(invalidateRoleCacheMock).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  getApiUserMock,
  resolveCapabilitiesMock,
  selectMock,
  findFirstMock,
  updateRunMock,
  deleteRunMock,
  recordAuditEventMock,
  loggerMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  selectMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateRunMock: vi.fn(),
  deleteRunMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  loggerMock: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api/auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    getApiUser: getApiUserMock,
    unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  };
});

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: loggerMock,
}));

vi.mock("@/lib/db/schema", () => ({
  judgeWorkers: {
    id: "id",
    status: "status",
    registeredAt: "registeredAt",
    concurrency: "concurrency",
  },
  submissions: {
    status: "status",
    judgeWorkerId: "judgeWorkerId",
    judgeClaimToken: "judgeClaimToken",
    judgeClaimedAt: "judgeClaimedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/lib/api/responses", async () => {
  const { NextResponse } = await import("next/server");
  return {
    apiSuccess: (data: unknown) => NextResponse.json({ data }),
    apiError: (error: string, status: number) =>
      NextResponse.json({ error }, { status }),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: selectMock,
    query: {
      judgeWorkers: { findFirst: findFirstMock },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          run: updateRunMock,
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        run: deleteRunMock,
      })),
    })),
  },
}));

import { GET } from "@/app/api/v1/admin/workers/route";
import { GET as GET_STATS } from "@/app/api/v1/admin/workers/stats/route";
import { PATCH, DELETE } from "@/app/api/v1/admin/workers/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ADMIN_USER = { id: "admin-1", role: "admin", username: "admin" };

function makeRequest(url: string, options?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  getApiUserMock.mockResolvedValue(ADMIN_USER);
  resolveCapabilitiesMock.mockResolvedValue(new Set(["system.settings"]));
});

// ---------------------------------------------------------------------------
// GET /admin/workers
// ---------------------------------------------------------------------------
describe("GET /api/v1/admin/workers", () => {
  it("returns workers list", async () => {
    const workers = [
      { id: "w1", hostname: "worker-01", status: "online" },
      { id: "w2", hostname: "worker-02", status: "offline" },
    ];
    selectMock.mockReturnValue({
      from: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue(workers),
      })),
    });

    const response = await GET(makeRequest("http://localhost/api/v1/admin/workers"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual(workers);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const response = await GET(makeRequest("http://localhost/api/v1/admin/workers"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when lacking system.settings capability", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set());

    const response = await GET(makeRequest("http://localhost/api/v1/admin/workers"));

    expect(response.status).toBe(403);
  });

  it("returns empty array on error", async () => {
    selectMock.mockImplementation(() => {
      throw new Error("DB error");
    });

    const response = await GET(makeRequest("http://localhost/api/v1/admin/workers"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/workers/stats
// ---------------------------------------------------------------------------
describe("GET /api/v1/admin/workers/stats", () => {
  it("returns aggregated stats", async () => {
    selectMock
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          groupBy: vi.fn().mockResolvedValue([
            { status: "online", count: 3 },
            { status: "offline", count: 1 },
          ]),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb: Function) => cb([{ count: 5 }])),
          }),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb: Function) => cb([{ count: 2 }])),
          }),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockReturnValue({
            then: vi.fn((cb: Function) => cb([{ total: 12 }])),
          }),
        })),
      });

    const response = await GET_STATS(
      makeRequest("http://localhost/api/v1/admin/workers/stats")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workersOnline).toBe(3);
    expect(payload.data.workersOffline).toBe(1);
    expect(payload.data.queueDepth).toBe(5);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const response = await GET_STATS(
      makeRequest("http://localhost/api/v1/admin/workers/stats")
    );

    expect(response.status).toBe(401);
  });

  it("returns zeroed stats on error", async () => {
    selectMock.mockImplementation(() => {
      throw new Error("DB error");
    });

    const response = await GET_STATS(
      makeRequest("http://localhost/api/v1/admin/workers/stats")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.workersOnline).toBe(0);
    expect(payload.data.queueDepth).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/workers/[id]
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/admin/workers/[id]", () => {
  it("updates worker alias", async () => {
    findFirstMock
      .mockResolvedValueOnce({ id: "w1", hostname: "worker-01" })
      .mockResolvedValueOnce({ id: "w1", hostname: "worker-01", alias: "My Worker" });

    const response = await PATCH(
      makeRequest("http://localhost/api/v1/admin/workers/w1", {
        method: "PATCH",
        body: JSON.stringify({ alias: "My Worker" }),
      }),
      makeParams("w1")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.alias).toBe("My Worker");
  });

  it("returns 404 when worker not found", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await PATCH(
      makeRequest("http://localhost/api/v1/admin/workers/nonexistent", {
        method: "PATCH",
        body: JSON.stringify({ alias: "test" }),
      }),
      makeParams("nonexistent")
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const response = await PATCH(
      makeRequest("http://localhost/api/v1/admin/workers/w1", {
        method: "PATCH",
        body: JSON.stringify({ alias: "test" }),
      }),
      makeParams("w1")
    );

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/workers/[id]
// ---------------------------------------------------------------------------
describe("DELETE /api/v1/admin/workers/[id]", () => {
  it("removes worker and reclaims submissions", async () => {
    findFirstMock.mockResolvedValue({ id: "w1", hostname: "worker-01" });

    const response = await DELETE(
      makeRequest("http://localhost/api/v1/admin/workers/w1", { method: "DELETE" }),
      makeParams("w1")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.ok).toBe(true);
    expect(recordAuditEventMock).toHaveBeenCalledOnce();
    expect(loggerMock.info).toHaveBeenCalledOnce();
  });

  it("returns 404 when worker not found", async () => {
    findFirstMock.mockResolvedValue(null);

    const response = await DELETE(
      makeRequest("http://localhost/api/v1/admin/workers/nonexistent", { method: "DELETE" }),
      makeParams("nonexistent")
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const response = await DELETE(
      makeRequest("http://localhost/api/v1/admin/workers/w1", { method: "DELETE" }),
      makeParams("w1")
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when lacking capability", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set());

    const response = await DELETE(
      makeRequest("http://localhost/api/v1/admin/workers/w1", { method: "DELETE" }),
      makeParams("w1")
    );

    expect(response.status).toBe(403);
  });
});

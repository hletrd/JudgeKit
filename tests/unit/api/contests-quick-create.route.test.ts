import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  transactionMock,
  recordAuditEventMock,
  getDbNowUncachedMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  transactionMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  getDbNowUncachedMock: vi.fn<() => Promise<Date>>(() => Promise.resolve(new Date("2026-04-08T12:00:00.000Z"))),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
}));

vi.mock("@/lib/api/handler", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/handler")>("@/lib/api/handler");
  return {
    ...actual,
  };
});

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: async (role: string) => ({
    has: (cap: string) => {
      if (role === "admin" || role === "super_admin") return true;
      return false;
    },
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  groups: {},
  assignments: {},
  assignmentProblems: {},
  problems: {},
  roles: {},
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: getDbNowUncachedMock,
}));

vi.mock("@/lib/auth/permissions", () => ({
  getAccessibleProblemIds: vi.fn(async (
    _userId: string,
    _role: string,
    list: Array<{ id: string }>
  ) => new Set(list.map((p) => p.id))),
}));

import { POST } from "@/app/api/v1/contests/quick-create/route";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/contests/quick-create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/contests/quick-create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbNowUncachedMock.mockResolvedValue(new Date("2026-04-08T12:00:00.000Z"));
    getApiUserMock.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      username: "admin",
      email: "admin@example.com",
      name: "Admin",
      className: null,
      mustChangePassword: false,
    });
    consumeApiRateLimitMock.mockReturnValue(null);
    transactionMock.mockResolvedValue(undefined);
  });

  it("rejects schedules where the deadline is not after the start", async () => {
    const res = await POST(makeRequest({
      title: "Recruiting Test",
      durationMinutes: 60,
      problemIds: ["problem-1"],
      startsAt: "2026-04-08T12:00:00.000Z",
      deadline: "2026-04-08T11:00:00.000Z",
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "assignmentScheduleInvalid" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

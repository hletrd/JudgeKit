import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  transactionMock,
  recordAuditEventMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn<() => NextResponse | null>(() => null),
  transactionMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
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
    isAdmin: (role: string) => role === "admin" || role === "super_admin",
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  groups: {},
  assignments: {},
  assignmentProblems: {},
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
  resolveCapabilitiesMock,
  dbSelectMock,
  dbInsertMock,
  dbUpdateMock,
  getDbNowMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  resolveCapabilitiesMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  getDbNowMock: vi.fn(() => Promise.resolve(new Date("2026-06-26T00:00:00Z"))),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  notFound: (resource: string) =>
    new Response(JSON.stringify({ error: "notFound", resource }), { status: 404 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: getDbNowMock,
}));

// Minimal select chain builder for the duplicate-check / existing-check queries.
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(rows);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: dbUpdateMock,
  },
}));

const adminUser = {
  id: "admin-1",
  username: "admin",
  role: "super_admin",
  email: "admin@example.com",
  name: "Admin",
  className: null,
  mustChangePassword: false,
};

function makeJsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
    body: JSON.stringify(body),
  });
}

describe("admin languages dockerImage allowlist (NEW-H4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue(adminUser);
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["system.settings"]));
  });

  it("POST rejects a non-judge dockerImage (arbitrary registry) with 422", async () => {
    dbSelectMock.mockReturnValueOnce(makeSelectChain([])); // no existing language
    const { POST } = await import("@/app/api/v1/admin/languages/route");

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/v1/admin/languages", "POST", {
        language: "evil",
        displayName: "Evil",
        extension: "ev",
        dockerImage: "attacker-registry/pwn:latest",
        runCommand: "./run",
      }), { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalidDockerImage");
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it("POST accepts a local judge-* dockerImage and inserts", async () => {
    dbSelectMock.mockReturnValueOnce(makeSelectChain([])); // no existing
    dbInsertMock.mockReturnValue({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: "lc-1", language: "python3" }])),
        })),
      })),
    });
    const { POST } = await import("@/app/api/v1/admin/languages/route");

    const res = await POST(
      makeJsonRequest("http://localhost:3000/api/v1/admin/languages", "POST", {
        language: "python3",
        displayName: "Python 3",
        extension: "py",
        dockerImage: "judge-python:3.12",
        runCommand: "python3 main.py",
      }), { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(201);
    expect(dbInsertMock).toHaveBeenCalledOnce();
  });

  it("PATCH rejects a non-judge dockerImage with 422", async () => {
    // existing language present
    dbSelectMock.mockReturnValueOnce(makeSelectChain([{ id: "lc-1" }]));
    const { PATCH } = await import("@/app/api/v1/admin/languages/[language]/route");

    const res = await PATCH(
      makeJsonRequest("http://localhost:3000/api/v1/admin/languages/python3", "PATCH", {
        dockerImage: "evil.example.com/root:latest",
      }),
      { params: Promise.resolve({ language: "python3" }) } as never,
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalidDockerImage");
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});

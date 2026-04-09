import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  recordAuditEventMock,
  dbSelectMock,
  dbInsertMock,
  canManageRoleAsyncMock,
  isUserRoleMock,
  generateApiKeyMock,
  encryptApiKeyMock,
  resolveCapabilitiesMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbInsertMock: vi.fn(),
  canManageRoleAsyncMock: vi.fn(),
  isUserRoleMock: vi.fn(),
  generateApiKeyMock: vi.fn(),
  encryptApiKeyMock: vi.fn((rawKey: string) => `enc:${rawKey}`),
  resolveCapabilitiesMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
  notFound: (resource: string) =>
    new Response(JSON.stringify({ error: "notFound", resource }), { status: 404 }),
  isAdmin: (role: string) => role === "admin" || role === "super_admin",
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
}));

vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

vi.mock("@/lib/security/constants", () => ({
  canManageRoleAsync: canManageRoleAsyncMock,
  isUserRole: isUserRoleMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/api/api-key-auth", () => ({
  generateApiKey: generateApiKeyMock,
  encryptApiKey: encryptApiKeyMock,
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(rows);
  chain.limit.mockReturnValue(rows);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    insert: dbInsertMock,
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

const adminUser = {
  id: "admin-id",
  username: "admin",
  role: "admin",
  email: "admin@example.com",
  name: "Admin User",
  className: null,
  mustChangePassword: false,
};

function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  return new NextRequest(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe("admin api keys routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue(adminUser);
    resolveCapabilitiesMock.mockImplementation((role: string) =>
      Promise.resolve(new Set(role === "admin" || role === "super_admin" ? ["system.settings"] : []))
    );
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    canManageRoleAsyncMock.mockResolvedValue(true);
    isUserRoleMock.mockReturnValue(true);
    generateApiKeyMock.mockReturnValue({
      rawKey: "jk_test_generated_key_1234567890",
      keyPrefix: "jk_test_",
      keyHash: "hashed-api-key-value",
    });
  });

  it("lists API keys without exposing the raw key material", async () => {
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          id: "key-1",
          name: "Deploy Key",
          keyPrefix: "jk_test_",
          role: "admin",
          createdById: "admin-id",
          createdByName: "Admin User",
          lastUsedAt: null,
          expiresAt: null,
          isActive: true,
          createdAt: "2026-04-04T00:00:00.000Z",
        },
      ])
    );

    const { GET } = await import("@/app/api/v1/admin/api-keys/route");
    const res = await GET(makeRequest("http://localhost:3000/api/v1/admin/api-keys"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      id: "key-1",
      keyPrefix: "jk_test_",
      name: "Deploy Key",
    });
    expect(body.data[0].keyPlain).toBeUndefined();
  });

  it("stores only the hash while returning the raw key once on creation", async () => {
    const returningMock = vi.fn().mockResolvedValue([
      { id: "key-1", name: "Deploy Key", keyPrefix: "jk_test_" },
    ]);
    const valuesMock = vi.fn(() => ({ returning: returningMock }));
    dbInsertMock.mockReturnValue({ values: valuesMock });

    const { POST } = await import("@/app/api/v1/admin/api-keys/route");
    const res = await POST(
      makeRequest("http://localhost:3000/api/v1/admin/api-keys", {
        method: "POST",
        body: { name: "Deploy Key", role: "admin", expiresAt: null },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Deploy Key",
        keyHash: "hashed-api-key-value",
        keyPrefix: "jk_test_",
      })
    );
    const insertedValues = (valuesMock.mock.calls as unknown[][])[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(insertedValues?.keyPlain).toBeUndefined();
    expect(body.data).toMatchObject({
      id: "key-1",
      key: "jk_test_generated_key_1234567890",
      keyPrefix: "jk_test_",
      name: "Deploy Key",
    });
  });

  it("rejects re-disclosure of an existing raw API key", async () => {
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        { id: "key-1", name: "Deploy Key" },
      ])
    );

    const { GET } = await import("@/app/api/v1/admin/api-keys/[id]/route");
    const res = await GET(
      makeRequest("http://localhost:3000/api/v1/admin/api-keys/key-1"),
      { params: Promise.resolve({ id: "key-1" }) } as never,
    );
    const body = await res.json();

    expect(res.status).toBe(410);
    expect(body.error).toBe("rawKeyRevealDisabled");
  });
});

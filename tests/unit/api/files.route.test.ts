import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  csrfForbiddenMock,
  consumeApiRateLimitMock,
  consumeUserApiRateLimitMock,
  resolveCapabilitiesMock,
  dbSelectMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  csrfForbiddenMock: vi.fn<() => Response | null>(() => null),
  consumeApiRateLimitMock: vi.fn<() => Promise<Response | null>>(() => Promise.resolve(null)),
  consumeUserApiRateLimitMock: vi.fn<() => Promise<Response | null>>(() => Promise.resolve(null)),
  resolveCapabilitiesMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: csrfForbiddenMock,
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: consumeApiRateLimitMock,
  consumeUserApiRateLimit: consumeUserApiRateLimitMock,
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
}));

vi.mock("@/lib/api/responses", () => ({
  apiSuccess: (data: unknown, opts?: { status?: number }) =>
    NextResponse.json({ data }, { status: opts?.status ?? 200 }),
  apiError: (error: string, status: number) =>
    NextResponse.json({ error }, { status }),
  apiPaginated: (data: unknown[], page: number, limit: number, total: number) =>
    NextResponse.json({ data, page, limit, total }),
}));

vi.mock("@/lib/api/pagination", () => ({
  parsePagination: (_params: URLSearchParams) => ({ page: 1, limit: 20, offset: 0 }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })),
  },
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockReturnValue(rows);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

const ADMIN_USER = {
  id: "admin-1",
  role: "admin",
  username: "admin",
  email: "admin@example.com",
  name: "Admin",
  className: null,
  mustChangePassword: false,
};

function makeListRequest() {
  return new NextRequest("http://localhost:3000/api/v1/files");
}

describe("GET /api/v1/files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue(ADMIN_USER);
    csrfForbiddenMock.mockReturnValue(null);
    consumeApiRateLimitMock.mockResolvedValue(null);
    consumeUserApiRateLimitMock.mockResolvedValue(null);
    resolveCapabilitiesMock.mockResolvedValue(new Set(["files.manage"]));
    dbSelectMock.mockReturnValue(makeSelectChain([]));
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/v1/files/route");
    const res = await GET(makeListRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(401);
    // The config-level IP-keyed limit is consumed before auth; the user-keyed
    // limit must only be consumed after a successful authz check.
    expect(consumeApiRateLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "files:list",
    );
    expect(consumeUserApiRateLimitMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the user lacks file capabilities", async () => {
    resolveCapabilitiesMock.mockResolvedValue(new Set([]));

    const { GET } = await import("@/app/api/v1/files/route");
    const res = await GET(makeListRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(403);
    expect(consumeUserApiRateLimitMock).not.toHaveBeenCalled();
  });

  it("applies the config-level IP-keyed rate limit before auth", async () => {
    const { GET } = await import("@/app/api/v1/files/route");
    await GET(makeListRequest(), { params: Promise.resolve({}) });

    expect(consumeApiRateLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "files:list",
    );
  });

  it("consumes a user-keyed rate limit after authorization", async () => {
    const { GET } = await import("@/app/api/v1/files/route");
    await GET(makeListRequest(), { params: Promise.resolve({}) });

    expect(consumeUserApiRateLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      ADMIN_USER.id,
      "files:list",
    );
  });

  it("returns 429 when repeated list requests exhaust the user-keyed rate limit", async () => {
    consumeUserApiRateLimitMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(
        NextResponse.json({ error: "rateLimited" }, { status: 429 }),
      );

    const { GET } = await import("@/app/api/v1/files/route");

    const first = await GET(makeListRequest(), { params: Promise.resolve({}) });
    expect(first.status).toBe(200);

    const second = await GET(makeListRequest(), { params: Promise.resolve({}) });
    expect(second.status).toBe(200);

    const third = await GET(makeListRequest(), { params: Promise.resolve({}) });
    expect(third.status).toBe(429);
    const body = await third.json();
    expect(body.error).toBe("rateLimited");
  });
});

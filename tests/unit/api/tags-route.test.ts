import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getApiUserMock = vi.fn();
const resolveCapabilitiesMock = vi.fn();
const dbSelectMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  unauthorized: () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
}));

vi.mock("@/lib/security/api-rate-limit", () => ({
  consumeApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/capabilities/cache", () => ({
  resolveCapabilities: resolveCapabilitiesMock,
  invalidateRoleCache: vi.fn(),
  getRoleLevel: vi.fn().mockResolvedValue(0),
  isValidRole: vi.fn().mockResolvedValue(true),
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

const TAG_ROW_1 = { id: "tag-1", name: "Arrays", color: "#ff0000" };
const TAG_ROW_2 = { id: "tag-2", name: "Dynamic Programming", color: "#00ff00" };
const TAG_ROW_3 = { id: "tag-3", name: "Graphs", color: "#0000ff" };

describe("GET /api/v1/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "user-1", role: "student" });
  });

  it("returns 401 when unauthenticated", async () => {
    getApiUserMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/tags/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tags"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("returns all tags when no search query is provided", async () => {
    dbSelectMock.mockReturnValueOnce(makeSelectChain([TAG_ROW_1, TAG_ROW_2, TAG_ROW_3]));
    const { GET } = await import("@/app/api/v1/tags/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tags"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);
  });

  it("filters tags by search query", async () => {
    dbSelectMock.mockReturnValueOnce(makeSelectChain([TAG_ROW_1]));
    const { GET } = await import("@/app/api/v1/tags/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tags?q=arr"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(dbSelectMock).toHaveBeenCalled();
  });

  it("respects the limit parameter", async () => {
    dbSelectMock.mockReturnValueOnce(makeSelectChain([TAG_ROW_1]));
    const { GET } = await import("@/app/api/v1/tags/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tags?limit=1"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const chain = dbSelectMock.mock.results[0].value;
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("caps limit at 100", async () => {
    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));
    const { GET } = await import("@/app/api/v1/tags/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tags?limit=500"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const chain = dbSelectMock.mock.results[0].value;
    expect(chain.limit).toHaveBeenCalledWith(100);
  });

  it("returns empty array when no tags match search", async () => {
    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));
    const { GET } = await import("@/app/api/v1/tags/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/v1/tags?q=zzz"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

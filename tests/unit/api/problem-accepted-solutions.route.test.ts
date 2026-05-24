import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { consumeApiRateLimitMock, problemsFindFirstMock, selectMock, getApiUserMock } = vi.hoisted(() => ({
  consumeApiRateLimitMock: vi.fn(() => null),
  problemsFindFirstMock: vi.fn(),
  selectMock: vi.fn(),
  getApiUserMock: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
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

function createChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockResolvedValue(result);
  return chain;
}

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: {
        findFirst: problemsFindFirstMock,
      },
    },
    select: selectMock,
  },
}));

describe("GET /api/v1/problems/[id]/accepted-solutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "viewer-1", username: "viewer", role: "student" });
    problemsFindFirstMock.mockResolvedValue({ id: "problem-1", visibility: "public" });
    const countChain = {
      from: vi.fn(),
      where: vi.fn(),
    };
    countChain.from.mockReturnValue(countChain);
    countChain.where.mockResolvedValue([{ total: 1 }]);

    selectMock
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(createChain([
        {
          submissionId: "submission-1",
          userId: "user-1",
          username: "alice",
          language: "python",
          sourceCode: "print(1)",
          codeLength: 8,
          executionTimeMs: 12,
          memoryUsedKb: 128,
          submittedAt: new Date("2026-04-16T00:00:00.000Z"),
          shareAcceptedSolutions: true,
          acceptedSolutionsAnonymous: false,
        },
      ]));
  });

  it("returns accepted solutions for a public problem", async () => {
    const { GET } = await import("@/app/api/v1/problems/[id]/accepted-solutions/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/problems/problem-1/accepted-solutions?sort=shortest&page=1&pageSize=10"),
      { params: Promise.resolve({ id: "problem-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        solutions: [
          expect.objectContaining({
            submissionId: "submission-1",
            username: "alice",
            isAnonymous: false,
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      },
    });
  });

  it("hides usernames for anonymous shared solutions and skips opted-out users", async () => {
    selectMock.mockReset();
    const countChain = {
      from: vi.fn(),
      where: vi.fn(),
    };
    countChain.from.mockReturnValue(countChain);
    countChain.where.mockResolvedValue([{ total: 2 }]);

    selectMock
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(createChain([
        {
          submissionId: "submission-1",
          userId: "user-1",
          username: "alice",
          language: "python",
          sourceCode: "print(1)",
          codeLength: 8,
          executionTimeMs: 12,
          memoryUsedKb: 128,
          submittedAt: new Date("2026-04-16T00:00:00.000Z"),
          shareAcceptedSolutions: true,
          acceptedSolutionsAnonymous: true,
        },
        {
          submissionId: "submission-2",
          userId: "user-2",
          username: "bob",
          language: "python",
          sourceCode: "print(2)",
          codeLength: 8,
          executionTimeMs: 11,
          memoryUsedKb: 120,
          submittedAt: new Date("2026-04-16T00:00:00.000Z"),
          shareAcceptedSolutions: false,
          acceptedSolutionsAnonymous: false,
        },
      ]));

    const { GET } = await import("@/app/api/v1/problems/[id]/accepted-solutions/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/problems/problem-1/accepted-solutions"),
      { params: Promise.resolve({ id: "problem-1" }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.solutions).toEqual([
      expect.objectContaining({
        submissionId: "submission-1",
        userId: null,
        username: "",
        isAnonymous: true,
      }),
    ]);
  });

  it("rejects unauthenticated callers with 401", async () => {
    getApiUserMock.mockResolvedValue(null);

    const { GET } = await import("@/app/api/v1/problems/[id]/accepted-solutions/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/problems/problem-1/accepted-solutions"),
      { params: Promise.resolve({ id: "problem-1" }) }
    );

    expect(response.status).toBe(401);
  });
});

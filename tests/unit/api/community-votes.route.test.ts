import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const {
  getApiUserMock,
  consumeApiRateLimitMock,
  threadFindFirstMock,
  postFindFirstMock,
  voteFindFirstMock,
  insertValuesMock,
  insertReturningMock,
  insertOnConflictDoUpdateMock,
  updateSetMock,
  updateWhereMock,
  deleteWhereMock,
  selectMock,
} = vi.hoisted(() => ({
  getApiUserMock: vi.fn(),
  consumeApiRateLimitMock: vi.fn(() => null),
  threadFindFirstMock: vi.fn(),
  postFindFirstMock: vi.fn(),
  voteFindFirstMock: vi.fn(),
  insertValuesMock: vi.fn(),
  insertReturningMock: vi.fn(),
  insertOnConflictDoUpdateMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  selectMock: vi.fn(),
}));

/** Builds a mock transaction object that mirrors the db mock's query interface. */
function buildTxMock() {
  const txSelectMock = vi.fn();
  const txInsertValuesMock = vi.fn();
  const txInsertOnConflictDoUpdateMock = vi.fn();
  const txUpdateSetMock = vi.fn();
  const txUpdateWhereMock = vi.fn();
  const txDeleteWhereMock = vi.fn();

  txInsertValuesMock.mockReturnValue({ returning: insertReturningMock, onConflictDoUpdate: txInsertOnConflictDoUpdateMock });
  txInsertOnConflictDoUpdateMock.mockResolvedValue(undefined);
  txUpdateSetMock.mockReturnValue({ where: txUpdateWhereMock });
  txUpdateWhereMock.mockResolvedValue(undefined);
  txDeleteWhereMock.mockResolvedValue(undefined);

  const txSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
  };
  txSelectChain.from.mockReturnValue(txSelectChain);
  txSelectChain.where.mockResolvedValue([{ score: 1, currentUserVote: "up" }]);
  txSelectMock.mockReturnValue(txSelectChain);

  return {
    query: {
      discussionThreads: { findFirst: threadFindFirstMock },
      discussionPosts: { findFirst: postFindFirstMock },
      communityVotes: { findFirst: voteFindFirstMock },
    },
    insert: vi.fn(() => ({ values: txInsertValuesMock })),
    update: vi.fn(() => ({ set: txUpdateSetMock })),
    delete: vi.fn(() => ({ where: txDeleteWhereMock })),
    select: txSelectMock,
  };
}

vi.mock("@/lib/api/auth", () => ({
  getApiUser: getApiUserMock,
  csrfForbidden: vi.fn(() => null),
  unauthorized: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbidden: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  notFound: (resource: string) => NextResponse.json({ error: "notFound", resource }, { status: 404 }),
  isAdmin: vi.fn(() => false),
  isInstructor: vi.fn(() => false),
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

vi.mock("@/lib/auth/permissions", () => ({
  canAccessProblem: vi.fn(async () => true),
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowUncached: vi.fn().mockResolvedValue(new Date("2026-04-20T12:00:00Z")),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      discussionThreads: {
        findFirst: threadFindFirstMock,
      },
      discussionPosts: {
        findFirst: postFindFirstMock,
      },
      communityVotes: {
        findFirst: voteFindFirstMock,
      },
    },
    insert: vi.fn(() => ({ values: insertValuesMock })),
    update: vi.fn(() => ({ set: updateSetMock })),
    delete: vi.fn(() => ({ where: deleteWhereMock })),
    select: selectMock,
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = buildTxMock();
      return fn(tx);
    }),
  },
}));

insertValuesMock.mockReturnValue({ returning: insertReturningMock, onConflictDoUpdate: insertOnConflictDoUpdateMock });
insertOnConflictDoUpdateMock.mockResolvedValue(undefined);
updateSetMock.mockReturnValue({ where: updateWhereMock });

function selectChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockResolvedValue(result);
  return chain;
}

describe("POST /api/v1/community/votes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({
      id: "user-1",
      role: "student",
      username: "user",
      email: "u@example.com",
      name: "User",
      className: null,
      mustChangePassword: false,
    });
    threadFindFirstMock.mockResolvedValue({
      id: "thread-1",
      authorId: "other-user",
      scopeType: "general",
      problemId: null,
    });
    voteFindFirstMock.mockResolvedValue(null);
    selectMock.mockReturnValue(selectChain([{ score: 1, currentUserVote: "up" }]));
  });

  it("casts a vote on a discussion thread", async () => {
    const { POST } = await import("@/app/api/v1/community/votes/route");
    const request = new NextRequest("http://localhost:3000/api/v1/community/votes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        targetType: "thread",
        targetId: "thread-1",
        voteType: "up",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        targetType: "thread",
        targetId: "thread-1",
        score: 1,
        currentUserVote: "up",
      },
    });
  });
});

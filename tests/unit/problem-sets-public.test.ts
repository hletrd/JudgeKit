import { beforeEach, describe, expect, it, vi } from "vitest";

const { problemSetsFindManyMock, problemSetsFindFirstMock, selectMock } = vi.hoisted(() => ({
  problemSetsFindManyMock: vi.fn(),
  problemSetsFindFirstMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problemSets: {
        findMany: problemSetsFindManyMock,
        findFirst: problemSetsFindFirstMock,
      },
    },
    select: selectMock,
  },
}));

describe("public problem set helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only public problem counts from public problem sets", async () => {
    problemSetsFindManyMock.mockResolvedValue([
      {
        id: "set-1",
        name: "DP Warmup",
        description: "starter set",
        createdAt: new Date("2026-04-16T00:00:00.000Z"),
        creator: { id: "user-1", name: "Alice", username: "alice" },
        problems: [
          { problem: { id: "problem-1", visibility: "public" } },
          { problem: { id: "problem-2", visibility: "private" } },
        ],
      },
    ]);

    const { listPublicProblemSets } = await import("@/lib/problem-sets/public");
    const sets = await listPublicProblemSets();

    expect(sets).toEqual([
      expect.objectContaining({
        id: "set-1",
        publicProblemCount: 1,
      }),
    ]);
  });

  it("marks solved problems for the viewing user on public problem set detail", async () => {
    problemSetsFindFirstMock.mockResolvedValue({
      id: "set-1",
      name: "DP Warmup",
      description: "starter set",
      createdAt: new Date("2026-04-16T00:00:00.000Z"),
      creator: { id: "user-1", name: "Alice", username: "alice" },
      problems: [
        { problemId: "problem-1", sortOrder: 0, problem: { id: "problem-1", title: "A + B", visibility: "public", difficulty: 1 } },
        { problemId: "problem-2", sortOrder: 1, problem: { id: "problem-2", title: "Secret", visibility: "private", difficulty: 2 } },
      ],
    });

    const chain = {
      from: vi.fn(),
      where: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockResolvedValue([{ problemId: "problem-1" }]);
    selectMock.mockReturnValue(chain);

    const { getPublicProblemSetById } = await import("@/lib/problem-sets/public");
    const set = await getPublicProblemSetById("set-1", "viewer-1");

    expect(set?.problems).toEqual([
      expect.objectContaining({
        id: "problem-1",
        solvedByViewer: true,
      }),
    ]);
  });
});

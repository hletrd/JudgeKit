import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  problemsFindMany: vi.fn(),
  assignmentsFindMany: vi.fn(),
  discussionThreadsFindMany: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ type: "eq", field, value })),
  ne: vi.fn((field: unknown, value: unknown) => ({ type: "ne", field, value })),
}));

vi.mock("@/lib/db/schema", () => ({
  problems: {
    visibility: "problems.visibility",
  },
  assignments: {
    visibility: "assignments.visibility",
    examMode: "assignments.examMode",
  },
  discussionThreads: {
    scopeType: "discussionThreads.scopeType",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      problems: {
        findMany: (...args: unknown[]) => mocks.problemsFindMany(...args),
      },
      assignments: {
        findMany: (...args: unknown[]) => mocks.assignmentsFindMany(...args),
      },
      discussionThreads: {
        findMany: (...args: unknown[]) => mocks.discussionThreadsFindMany(...args),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_URL", "https://judgekit.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap metadata route", () => {
  it("returns static and dynamic public URLs", async () => {
    const now = new Date("2026-04-15T00:00:00.000Z");
    mocks.problemsFindMany.mockResolvedValue([
      { id: "problem-1", updatedAt: now },
    ]);
    mocks.assignmentsFindMany.mockResolvedValue([
      { id: "contest-1", updatedAt: now },
    ]);
    mocks.discussionThreadsFindMany.mockResolvedValue([
      { id: "thread-1", updatedAt: now },
    ]);

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();

    expect(entries).toEqual(expect.arrayContaining([
      { url: "https://judgekit.example/", changeFrequency: "daily", priority: 1 },
      { url: "https://judgekit.example/practice", changeFrequency: "daily", priority: 0.9 },
      { url: "https://judgekit.example/contests", changeFrequency: "daily", priority: 0.8 },
      { url: "https://judgekit.example/community", changeFrequency: "daily", priority: 0.7 },
      { url: "https://judgekit.example/playground", changeFrequency: "weekly", priority: 0.7 },
      {
        url: "https://judgekit.example/practice/problems/problem-1",
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: "https://judgekit.example/contests/contest-1",
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.7,
      },
      {
        url: "https://judgekit.example/community/threads/thread-1",
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      },
    ]));
  });
});

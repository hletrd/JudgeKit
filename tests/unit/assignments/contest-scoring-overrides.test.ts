import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * N7-C7 regression: `computeContestRanking` (IOI) must overlay
 * `score_overrides` exactly as the gradebook does, so the contest leaderboard /
 * export / analytics agree with the gradebook for the same assignment.
 *
 * These tests drive the REAL `_computeContestRankingInner` by mocking only the
 * DB query helpers. The query order inside the function is:
 *   rawQueryOne  -> assignment meta
 *   rawQueryAll  -> (1) scoring rows, (2) assignment-problem rows, (3) override rows
 */

const { rawQueryAllMock, rawQueryOneMock, getDbNowMsMock } = vi.hoisted(() => ({
  rawQueryAllMock: vi.fn(),
  rawQueryOneMock: vi.fn(),
  getDbNowMsMock: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  rawQueryAll: rawQueryAllMock,
  rawQueryOne: rawQueryOneMock,
}));

vi.mock("@/lib/db-time", () => ({
  getDbNowMs: getDbNowMsMock,
}));

import { computeContestRanking, invalidateRankingCache } from "@/lib/assignments/contest-scoring";

const IOI_META = {
  scoringModel: "ioi",
  startsAt: null,
  deadline: null,
  latePenalty: null,
  examMode: "none",
};

type ScoringRow = {
  userId: string;
  username: string;
  name: string;
  className: string | null;
  problemId: string;
  points: number;
  attemptCount: number;
  bestScore: number | null;
  hasAc: number;
  firstAcAt: Date | null;
  wrongBeforeAc: number;
};

function scoringRow(partial: Partial<ScoringRow> & Pick<ScoringRow, "userId" | "problemId" | "bestScore">): ScoringRow {
  return {
    username: `${partial.userId}-name`,
    name: `${partial.userId} Name`,
    className: null,
    points: 100,
    attemptCount: 1,
    hasAc: 0,
    firstAcAt: null,
    wrongBeforeAc: 0,
    ...partial,
  } as ScoringRow;
}

function setupQueries(opts: {
  scoringRows: ScoringRow[];
  problems: { problemId: string; points: number }[];
  overrides: { userId: string; problemId: string; overrideScore: number }[];
}) {
  rawQueryOneMock.mockResolvedValue(IOI_META);
  rawQueryAllMock
    .mockResolvedValueOnce(opts.scoringRows) // (1) scoring rows
    .mockResolvedValueOnce(opts.problems) // (2) assignment-problem rows
    .mockResolvedValueOnce(opts.overrides); // (3) override rows
  getDbNowMsMock.mockResolvedValue(Date.now());
}

describe("computeContestRanking IOI score-override overlay (N7-C7)", () => {
  beforeEach(() => {
    rawQueryAllMock.mockReset();
    rawQueryOneMock.mockReset();
    getDbNowMsMock.mockReset();
    // Each test uses a distinct assignmentId so the module-level ranking cache
    // never serves a previous test's result.
  });

  afterEach(() => {
    invalidateRankingCache(); // clear cache between tests
  });

  it("override REPLACES a participant's judged score and changes ranking", async () => {
    setupQueries({
      scoringRows: [
        scoringRow({ userId: "userA", problemId: "p1", bestScore: 60 }),
        scoringRow({ userId: "userB", problemId: "p1", bestScore: 80 }),
      ],
      problems: [{ problemId: "p1", points: 100 }],
      overrides: [{ userId: "userA", problemId: "p1", overrideScore: 100 }],
    });

    const { entries } = await computeContestRanking("assignment-replace");

    const a = entries.find((e) => e.userId === "userA");
    const b = entries.find((e) => e.userId === "userB");
    expect(a?.problems[0].score).toBe(100); // override applied
    expect(a?.totalScore).toBe(100);
    expect(b?.problems[0].score).toBe(80); // unchanged
    // A now outranks B (rank 1) on the override.
    expect(a?.rank).toBe(1);
    expect(b?.rank).toBe(2);
  });

  it("override of 0 zeroes the problem (presence test, not truthiness)", async () => {
    setupQueries({
      scoringRows: [scoringRow({ userId: "userA", problemId: "p1", bestScore: 100 })],
      problems: [{ problemId: "p1", points: 100 }],
      overrides: [{ userId: "userA", problemId: "p1", overrideScore: 0 }],
    });

    const { entries } = await computeContestRanking("assignment-zero");
    const a = entries.find((e) => e.userId === "userA");
    expect(a?.problems[0].score).toBe(0);
    expect(a?.problems[0].solved).toBe(false);
    expect(a?.totalScore).toBe(0);
  });

  it("override does not re-apply late penalty (override wins over adjusted judged score)", async () => {
    // Late-penalty adjustment already produced bestScore=50; override 90 must
    // win as-is (no penalty re-applied on top).
    setupQueries({
      scoringRows: [scoringRow({ userId: "userA", problemId: "p1", bestScore: 50 })],
      problems: [{ problemId: "p1", points: 100 }],
      overrides: [{ userId: "userA", problemId: "p1", overrideScore: 90 }],
    });

    const { entries } = await computeContestRanking("assignment-latepenalty");
    const a = entries.find((e) => e.userId === "userA");
    expect(a?.problems[0].score).toBe(90);
  });

  it("no override leaves the judged score untouched", async () => {
    setupQueries({
      scoringRows: [scoringRow({ userId: "userA", problemId: "p1", bestScore: 70 })],
      problems: [{ problemId: "p1", points: 100 }],
      overrides: [],
    });

    const { entries } = await computeContestRanking("assignment-noop");
    const a = entries.find((e) => e.userId === "userA");
    expect(a?.problems[0].score).toBe(70);
  });

  it("override on a problem the participant never attempted still applies (no row)", async () => {
    // userA has a submission to p1 but none to p2; an override on p2 applies.
    setupQueries({
      scoringRows: [scoringRow({ userId: "userA", problemId: "p1", bestScore: 40 })],
      problems: [
        { problemId: "p1", points: 100 },
        { problemId: "p2", points: 100 },
      ],
      overrides: [{ userId: "userA", problemId: "p2", overrideScore: 100 }],
    });

    const { entries } = await computeContestRanking("assignment-norow");
    const a = entries.find((e) => e.userId === "userA");
    const p2 = a?.problems.find((p) => p.problemId === "p2");
    expect(p2?.score).toBe(100);
    expect(p2?.solved).toBe(true);
    expect(a?.totalScore).toBe(140); // 40 (p1) + 100 (p2 override)
  });
});

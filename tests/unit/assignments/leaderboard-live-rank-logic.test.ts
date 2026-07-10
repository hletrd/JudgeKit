import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/**
 * Tests for leaderboard.ts computeSingleUserLiveRank implementation.
 *
 * The computeSingleUserLiveRank function uses raw SQL queries against the
 * database, so pure unit tests that exercise the SQL are not feasible without
 * integration infrastructure. Instead, these tests validate the *implementation
 * structure* — ensuring that the logic branches, SQL fragments, and safety
 * guards exist and are consistent with the main leaderboard query.
 *
 * Key consistency checks:
 * - IOI branch uses buildIoiLatePenaltyCaseExpr (same SQL fragment as contest-scoring.ts)
 * - IOI branch LEFT JOINs exam_sessions for windowed late penalty
 * - IOI rank uses ROUND(total_score, 2) for tie-breaking consistency
 * - IOI branch sums the PER-PROBLEM BEST score (MAX per user+problem), then
 *   SUMs the bests per user — NOT a SUM over all submission rows (N8-C8-LIVERANK).
 *   This is the invariant that keeps the live rank in agreement with the full
 *   board (contest-scoring.ts MAX-per-problem then sum).
 * - ICPC branch counts users with more solved or same solved + less penalty
 * - Both branches return null when user has no submissions
 */
describe("computeSingleUserLiveRank implementation", () => {
  const source = read("src/lib/assignments/leaderboard.ts");

  describe("IOI branch", () => {
    it("uses the shared buildIoiLatePenaltyCaseExpr for scoring SQL", () => {
      expect(source).toContain("buildIoiLatePenaltyCaseExpr");
    });

    it("LEFT JOINs exam_sessions for windowed late penalty", () => {
      expect(source).toContain("LEFT JOIN exam_sessions");
      expect(source).toContain("es.assignment_id = s.assignment_id");
      expect(source).toContain("es.user_id = s.user_id");
    });

    it("uses ROUND(total_score, 2) for tie-breaking consistency with main leaderboard", () => {
      // The main leaderboard uses isScoreTied with epsilon 0.01.
      // The SQL query must use ROUND to avoid float-drift discrepancies.
      expect(source).toContain("ROUND(us.total_score, 2) > ROUND(t.total_score, 2)");
    });

    it("computes rank as 1 + count of users with higher score", () => {
      expect(source).toContain("1 + COUNT(*)");
    });

    it("aggregates the PER-PROBLEM BEST score via a per_problem CTE (N8-C8-LIVERANK)", () => {
      // The IOI live rank must sum each problem's best adjusted score, not all
      // submission rows. Guard the per-problem-best inner aggregate.
      expect(source).toContain("per_problem AS (");
      // MAX over rows, grouped by user+problem, gives the per-problem best.
      expect(source).toContain("MAX(");
      expect(source).toContain("GROUP BY s.user_id, s.problem_id");
    });

    it("sums the per-problem bests per user (not a SUM over all submission rows)", () => {
      // The outer per-user total must SUM the per_problem bests.
      expect(source).toContain("ROUND(SUM(COALESCE(best, 0)), 2) AS total_score");
      expect(source).toContain("FROM per_problem");
      // Regression guard: the old SUM-over-rows shape (SUM of the per-row CASE
      // expression grouped only by user_id) must NOT reappear.
      expect(source).not.toMatch(/ROUND\(SUM\(\s*CASE WHEN s\.score IS NOT NULL/);
    });

    it("returns null when the user has no submissions (hasSubmissions guard)", () => {
      expect(source).toContain("hasSubmissions");
      expect(source).toMatch(/if \(!result\.hasSubmissions\) return null/);
    });
  });

  describe("ICPC branch", () => {
    it("ranks by solved_count descending then total_penalty ascending", () => {
      expect(source).toContain("ut.solved_count > t.solved_count");
      expect(source).toContain("ut.solved_count = t.solved_count AND ut.total_penalty < t.total_penalty");
    });

    it("treats equal (solved, penalty) as the same rank — no extra tie discriminators", () => {
      // The full board (contest-scoring.ts) gives tied (solved, penalty)
      // entries the SAME rank; last_ac_at/user_id discriminators here made
      // the live rank disagree with the board by one for tied users
      // (RPF cycle-1 M11).
      expect(source).not.toContain("ut.last_ac_at < t.last_ac_at");
      expect(source).not.toContain("ut.user_id < t.user_id");
    });

    it("computes penalty as minutes from contest start + 20 * wrong_before_ac (matching main leaderboard)", () => {
      // Minutes are measured FROM startsAt (computeIcpcPenalty), not absolute
      // epoch minutes, and a null startsAt yields no live rank to match the
      // board's empty-ranking guard (RPF cycle-1 L13).
      expect(source).toContain("FLOOR(EXTRACT(EPOCH FROM (us.first_ac_at - @startsAt::timestamptz)) / 60)::bigint");
      expect(source).toContain("if (!startRow?.startsAt)");
      // wrong_before_ac uses a window function to count only pre-AC wrongs,
      // not all wrongs (which attempt_count - has_ac would do).
      expect(source).toContain("20 * us.wrong_before_ac");
    });

    it("uses a base CTE with first_ac_at window function for wrongBeforeAc calculation", () => {
      // Matches the pattern in contest-scoring.ts: window function for first_ac_at,
      // then wrongBeforeAc counts wrong submissions before first AC.
      expect(source).toContain("OVER (PARTITION BY s.user_id, s.problem_id) AS first_ac_at");
      expect(source).toContain("wrong_before_ac");
      expect(source).toContain("EXTRACT(EPOCH FROM submitted_at)::bigint < COALESCE(EXTRACT(EPOCH FROM first_ac_at)::bigint, 9999999999)");
    });

    it("returns null when user has no submissions", () => {
      // The ICPC branch also has the hasSubmissions guard
      expect(source).toMatch(/if \(!result\.hasSubmissions\) return null/);
    });
  });

  describe("shared safety patterns", () => {
    it("returns null when assignment metadata is missing", () => {
      expect(source).toContain("if (!meta) return null");
    });

    it("returns null when the raw query returns no rows", () => {
      expect(source).toContain("if (!result) return null");
    });

    it("uses TERMINAL_SUBMISSION_STATUSES_SQL_LIST for submission filtering", () => {
      expect(source).toContain("TERMINAL_SUBMISSION_STATUSES_SQL_LIST");
    });
  });

  describe("parameter binding", () => {
    it("passes deadline, latePenalty, and examMode parameters for IOI query", () => {
      expect(source).toContain("deadlineMs:");
      expect(source).toContain("latePenalty:");
      expect(source).toContain("examMode:");
    });
  });
});

describe("computeLeaderboard implementation", () => {
  const source = read("src/lib/assignments/leaderboard.ts");

  it("delegates to computeContestRanking for live (non-frozen) data", () => {
    expect(source).toContain("computeContestRanking(assignmentId)");
  });

  it("passes freeze timestamp to computeContestRanking for frozen data", () => {
    expect(source).toContain("computeContestRanking(assignmentId, freezeSec)");
  });

  it("determines frozen state based on freezeLeaderboardAt and isInstructorView", () => {
    expect(source).toContain("freezeLeaderboardAt");
    expect(source).toContain("isInstructorView");
  });
});

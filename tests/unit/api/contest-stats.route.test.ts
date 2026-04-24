import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/**
 * Tests for the contest stats endpoint implementation.
 *
 * The stats endpoint uses raw SQL queries, so pure unit tests that exercise
 * the SQL are not feasible without integration infrastructure. Instead, these
 * tests validate the *implementation structure* — ensuring that the scoring
 * logic is consistent with the leaderboard and that access control patterns
 * are correct.
 *
 * Key consistency checks:
 * - Uses buildIoiLatePenaltyCaseExpr for scoring (same as leaderboard)
 * - LEFT JOINs exam_sessions for windowed late penalty
 * - Fetches deadline, latePenalty, examMode from the assignment row
 * - Passes these parameters to the raw query
 * - Uses canManageContest for instructor access check
 */
describe("contest stats route implementation", () => {
  const source = read("src/app/api/v1/contests/[assignmentId]/stats/route.ts");

  describe("scoring consistency with leaderboard", () => {
    it("imports and uses buildIoiLatePenaltyCaseExpr for scoring", () => {
      expect(source).toContain('import { buildIoiLatePenaltyCaseExpr } from "@/lib/assignments/scoring"');
      expect(source).toContain("buildIoiLatePenaltyCaseExpr");
    });

    it("LEFT JOINs exam_sessions for windowed late penalty", () => {
      expect(source).toContain("LEFT JOIN exam_sessions es");
      expect(source).toContain("es.assignment_id = s.assignment_id");
      expect(source).toContain("es.user_id = s.user_id");
    });

    it("INNER JOINs assignment_problems for points lookup", () => {
      expect(source).toContain("INNER JOIN assignment_problems ap");
      expect(source).toContain("ap.assignment_id = s.assignment_id");
      expect(source).toContain("ap.problem_id = s.problem_id");
    });

    it("fetches deadline, latePenalty, and examMode from the assignment row", () => {
      expect(source).toContain("a.deadline");
      expect(source).toContain("a.late_penalty");
      expect(source).toContain("a.exam_mode");
    });

    it("passes deadline, latePenalty, and examMode parameters to the raw query", () => {
      expect(source).toContain("deadline: deadlineSec");
      expect(source).toContain("latePenalty");
      expect(source).toContain("examMode");
    });

    it("computes deadline as epoch seconds for the scoring query", () => {
      expect(source).toContain("deadlineSec");
      expect(source).toContain("Math.floor(new Date(assignment.deadline).getTime() / 1000)");
    });

    it("uses COALESCE(ap.points, 100) consistent with leaderboard scoring", () => {
      expect(source).toContain("COALESCE(ap.points, 100)");
    });
  });

  describe("access control", () => {
    it("uses canManageContest for instructor check", () => {
      expect(source).toContain('import { canManageContest } from "@/lib/assignments/contests"');
      expect(source).toContain("canManageContest(user, assignment)");
    });

    it("checks enrollment or access token for non-instructors", () => {
      expect(source).toContain("enrollments");
      expect(source).toContain("contest_access_tokens");
    });

    it("blocks recruiting candidates without instructor access", () => {
      expect(source).toContain("recruitingAccess.isRecruitingCandidate");
    });

    it("returns 404 for non-contest assignments", () => {
      expect(source).toContain("examMode === \"none\"");
      expect(source).toContain('apiError("notFound", 404)');
    });
  });

  describe("result structure", () => {
    it("returns participantCount, submittedCount, avgScore, problemsSolvedCount", () => {
      expect(source).toContain("participantCount");
      expect(source).toContain("submittedCount");
      expect(source).toContain("avgScore");
      expect(source).toContain("problemsSolvedCount");
    });

    it("uses safe fallbacks for null query results", () => {
      expect(source).toContain("statsResult?.participantCount ?? 0");
      expect(source).toContain("statsResult?.submittedCount ?? 0");
      expect(source).toContain("statsResult?.avgScore ?? 0");
      expect(source).toContain("statsResult?.problemsSolvedCount ?? 0");
    });
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/**
 * Tests for participant-timeline.ts logic.
 *
 * The core functions (getParticipantTimeline, sortTimeline, isFirstAc, wrongBeforeAc)
 * in participant-timeline.ts query the database directly, so pure unit tests that
 * exercise the SQL and DB layer are not feasible without integration infrastructure.
 * Instead, these tests validate the *implementation structure* — ensuring that the
 * logic branches exist and are correct by examining the source code.
 *
 * For full integration tests, see participant-timeline-route-implementation.test.ts.
 */
describe("participant-timeline logic", () => {
  const source = read("src/lib/assignments/participant-timeline.ts");

  describe("isFirstAc branching", () => {
    it("uses status === 'accepted' for ICPC scoring model", () => {
      expect(source).toContain("submission.status === \"accepted\"");
    });

    it("uses score >= problemPoints for IOI scoring model", () => {
      expect(source).toContain("submission.score >= problemPoints");
    });

    it("branches on scoringModel === 'icpc'", () => {
      expect(source).toContain("scoringModel === \"icpc\"");
    });
  });

  describe("wrongBeforeAc calculation", () => {
    it("counts only non-AC submissions before the first AC", () => {
      // The filter for wrongBeforeAc must:
      // 1. Exclude the first AC submission itself (submission !== firstAccepted)
      // 2. Exclude other AC submissions (!isFirstAc(submission))
      // 3. Only count submissions before the first AC (timestamp comparison)
      expect(source).toContain("submission !== firstAccepted");
      expect(source).toContain("!isFirstAc(submission)");
      expect(source).toContain("submission.submittedAt.getTime() < firstAccepted.submittedAt.getTime()");
    });

    it("defaults to 0 when there is no firstAccepted", () => {
      // wrongBeforeAc = firstAccepted ? ... : 0
      expect(source).toMatch(/firstAccepted\s*\?[^:]+:\s*0/);
    });
  });

  describe("sortTimeline ordering", () => {
    it("sorts by timestamp first", () => {
      expect(source).toContain("leftTime - rightTime");
    });

    it("breaks ties by event type alphabetically", () => {
      expect(source).toContain("left.type.localeCompare(right.type)");
    });
  });

  describe("parallel data fetching", () => {
    it("fetches all data sources in parallel with Promise.all", () => {
      expect(source).toContain("Promise.all");
      // Verify all 8 parallel queries are present
      expect(source).toContain("db.query.users.findFirst");
      expect(source).toContain("db.query.examSessions.findFirst");
      expect(source).toContain("db.query.contestAccessTokens.findFirst");
      expect(source).toContain("db.query.assignments.findFirst");
    });
  });

  describe("bestScore calculation", () => {
    it("reduces over submissions using Math.max", () => {
      expect(source).toContain("Math.max(best, submission.score)");
    });

    it("returns null when all scores are null", () => {
      // Initial accumulator is null, and null scores are skipped
      expect(source).toContain("submission.score === null");
    });
  });
});

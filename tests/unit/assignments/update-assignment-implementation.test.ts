import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("updateAssignmentWithProblems implementation guards", () => {
  it("rechecks assignment problem-lock state inside the update transaction", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/assignments/management.ts"), "utf8");

    expect(source).toContain("problemLinksChanged && !allowLockedProblemChanges");
    expect(source).toContain('throw new Error("assignmentProblemsLocked")');
    expect(source).toContain(".from(submissions)");
  });

  it("invalidates the leaderboard ranking cache after an assignment PATCH", () => {
    const route = readFileSync(
      join(process.cwd(), "src/app/api/v1/groups/[id]/assignments/[assignmentId]/route.ts"),
      "utf8"
    );
    // Scoring-affecting edits (latePenalty/deadline/points/scoringModel) must
    // drop the cached standings so the leaderboard matches the gradebook.
    expect(route).toContain("invalidateRankingCache(assignmentId)");
  });
});

import { describe, expect, it } from "vitest";
import { withCurrentSubmission, type ProblemSubmissionHistoryRow } from "@/lib/submissions/problem-history";

function row(id: string, submittedAt: number | null, status = "wrong_answer"): ProblemSubmissionHistoryRow {
  return {
    id,
    language: "python",
    status,
    score: null,
    submittedAt,
    executionTimeMs: null,
    memoryUsedKb: null,
    failedTestCaseIndex: null,
    runtimeErrorType: null,
  };
}

describe("withCurrentSubmission", () => {
  it("adds the submission being viewed to the owner's list, newest first", () => {
    const others = [row("older-2", 2_000), row("older-1", 1_000)];
    const merged = withCurrentSubmission(others, row("current", 3_000, "accepted"));

    expect(merged.map((r) => r.id)).toEqual(["current", "older-2", "older-1"]);
    expect(merged[0].status).toBe("accepted");
  });

  it("slots an older submission into its chronological place", () => {
    const others = [row("newer", 5_000), row("oldest", 1_000)];

    expect(withCurrentSubmission(others, row("current", 3_000)).map((r) => r.id)).toEqual([
      "newer",
      "current",
      "oldest",
    ]);
  });

  it("prefers the live row over a stale server copy of the same submission", () => {
    const others = [row("current", 3_000, "pending"), row("older", 1_000)];
    const merged = withCurrentSubmission(others, row("current", 3_000, "accepted"));

    expect(merged.filter((r) => r.id === "current")).toHaveLength(1);
    expect(merged[0].status).toBe("accepted");
  });

  it("returns the other submissions unchanged when the viewer does not own this one", () => {
    const others = [row("a", 2_000), row("b", 1_000)];
    const merged = withCurrentSubmission(others, null);

    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
    expect(merged).not.toBe(others);
  });

  it("sorts rows without a timestamp last", () => {
    const merged = withCurrentSubmission([row("untimed", null), row("older", 1_000)], row("current", 2_000));

    expect(merged.map((r) => r.id)).toEqual(["current", "older", "untimed"]);
  });
});

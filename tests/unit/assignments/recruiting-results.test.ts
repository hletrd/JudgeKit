import { describe, expect, it } from "vitest";
import {
  computeRecruitResultsTotals,
  type RecruitBestSubmission,
  type RecruitProblemRow,
} from "@/lib/assignments/recruiting-results";

// CYC3-AGG-2: extracted from the recruit-results server-component so the
// units-correct math can be pinned behind a unit test. The cycle-1 C1-AGG-2
// regression accumulated raw % alongside per-problem points; keeping the
// helper behind a typed boundary plus this test prevents recurrence.

describe("computeRecruitResultsTotals", () => {
  it("returns zeros and an empty map for an empty assignment", () => {
    const r = computeRecruitResultsTotals([], new Map());
    expect(r.totalScore).toBe(0);
    expect(r.totalPossible).toBe(0);
    expect(r.adjustedByProblem.size).toBe(0);
  });

  it("scales per-problem percentages to weighted points (cycle-1 C1-AGG-2 regression scenario)", () => {
    // Three 25-point problems at 80% / 60% / 100% → 20 + 15 + 25 = 60 of 75.
    // The previous broken implementation accumulated raw % alongside points
    // and would have produced 240 / 75.
    const apRows: RecruitProblemRow[] = [
      { problemId: "p1", points: 25 },
      { problemId: "p2", points: 25 },
      { problemId: "p3", points: 25 },
    ];
    const best = new Map<string, RecruitBestSubmission>([
      ["p1", { score: 80 }],
      ["p2", { score: 60 }],
      ["p3", { score: 100 }],
    ]);
    const r = computeRecruitResultsTotals(apRows, best);
    expect(r.totalPossible).toBe(75);
    expect(r.totalScore).toBe(60);
    expect(r.adjustedByProblem.get("p1")).toBe(20);
    expect(r.adjustedByProblem.get("p2")).toBe(15);
    expect(r.adjustedByProblem.get("p3")).toBe(25);
  });

  it("handles a perfect run with totalScore == totalPossible", () => {
    const apRows: RecruitProblemRow[] = [
      { problemId: "a", points: 50 },
      { problemId: "b", points: 30 },
    ];
    const best = new Map<string, RecruitBestSubmission>([
      ["a", { score: 100 }],
      ["b", { score: 100 }],
    ]);
    const r = computeRecruitResultsTotals(apRows, best);
    expect(r.totalScore).toBe(80);
    expect(r.totalPossible).toBe(80);
  });

  it("does not contribute to totalScore when there is no best submission for a problem", () => {
    const apRows: RecruitProblemRow[] = [
      { problemId: "p1", points: 40 },
      { problemId: "p2", points: 60 },
    ];
    const best = new Map<string, RecruitBestSubmission>([
      ["p1", { score: 50 }],
      // p2: no submission
    ]);
    const r = computeRecruitResultsTotals(apRows, best);
    // p1 contributes 40 * 50 / 100 = 20. p2 contributes 0.
    expect(r.totalScore).toBe(20);
    expect(r.totalPossible).toBe(100);
    expect(r.adjustedByProblem.has("p1")).toBe(true);
    expect(r.adjustedByProblem.has("p2")).toBe(false);
  });

  it("ignores best submissions whose score is null", () => {
    const apRows: RecruitProblemRow[] = [
      { problemId: "p1", points: 50 },
    ];
    const best = new Map<string, RecruitBestSubmission>([
      ["p1", { score: null }],
    ]);
    const r = computeRecruitResultsTotals(apRows, best);
    expect(r.totalScore).toBe(0);
    expect(r.totalPossible).toBe(50);
    expect(r.adjustedByProblem.has("p1")).toBe(false);
  });

  it("defaults a null assignmentProblems.points to 100", () => {
    const apRows: RecruitProblemRow[] = [
      { problemId: "p1", points: null },
    ];
    const best = new Map<string, RecruitBestSubmission>([
      ["p1", { score: 50 }],
    ]);
    const r = computeRecruitResultsTotals(apRows, best);
    expect(r.totalPossible).toBe(100);
    expect(r.totalScore).toBe(50); // 50% of 100
  });

  it("clamps negative scores via mapSubmissionPercentageToAssignmentPoints", () => {
    // Defence-in-depth: if a submission row somehow has a negative score,
    // the underlying helper clamps to 0. This pins the integration with
    // mapSubmissionPercentageToAssignmentPoints (which guards via Math.min/
    // Math.max + cycle-3 NaN guard).
    const apRows: RecruitProblemRow[] = [
      { problemId: "p1", points: 50 },
    ];
    const best = new Map<string, RecruitBestSubmission>([
      ["p1", { score: -10 }],
    ]);
    const r = computeRecruitResultsTotals(apRows, best);
    expect(r.totalScore).toBe(0);
  });

  it("clamps scores > 100 to 100 (matches mapSubmissionPercentageToAssignmentPoints)", () => {
    const apRows: RecruitProblemRow[] = [
      { problemId: "p1", points: 40 },
    ];
    const best = new Map<string, RecruitBestSubmission>([
      ["p1", { score: 150 }],
    ]);
    const r = computeRecruitResultsTotals(apRows, best);
    expect(r.totalScore).toBe(40);
  });
});

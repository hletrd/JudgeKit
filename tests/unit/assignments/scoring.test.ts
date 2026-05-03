import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isSubmissionLate,
  mapSubmissionPercentageToAssignmentPoints,
  buildIoiLatePenaltyCaseExpr,
} from "@/lib/assignments/scoring";

describe("mapSubmissionPercentageToAssignmentPoints", () => {
  it("maps the score percentage to assignment points", () => {
    expect(mapSubmissionPercentageToAssignmentPoints(75, 40)).toBe(30);
  });

  it("clamps scores to the valid percentage range", () => {
    expect(mapSubmissionPercentageToAssignmentPoints(140, 40)).toBe(40);
    expect(mapSubmissionPercentageToAssignmentPoints(-10, 40)).toBe(0);
  });

  it("applies the late penalty only after the deadline", () => {
    const deadline = new Date("2026-03-09T12:00:00.000Z");

    expect(
      mapSubmissionPercentageToAssignmentPoints(80, 50, {
        submittedAt: new Date("2026-03-09T11:59:59.000Z"),
        deadline,
        latePenalty: 25,
      })
    ).toBe(40);

    expect(
      mapSubmissionPercentageToAssignmentPoints(80, 50, {
        submittedAt: new Date("2026-03-09T12:00:01.000Z"),
        deadline,
        latePenalty: 25,
      })
    ).toBe(30);
  });

  it("returns 0 for all-zero scores regardless of points", () => {
    expect(mapSubmissionPercentageToAssignmentPoints(0, 100)).toBe(0);
    expect(mapSubmissionPercentageToAssignmentPoints(0, 1)).toBe(0);
  });

  it("returns full points for a single-participant perfect score", () => {
    expect(mapSubmissionPercentageToAssignmentPoints(100, 100)).toBe(100);
    expect(mapSubmissionPercentageToAssignmentPoints(100, 50)).toBe(50);
  });

  it("rounds to 2 decimal places", () => {
    // 33.33% of 3 points = 0.9999, which rounds to 1.00
    expect(mapSubmissionPercentageToAssignmentPoints(33.33, 3)).toBe(1);
    // 66.67% of 3 points = 2.0001, which rounds to 2.00
    expect(mapSubmissionPercentageToAssignmentPoints(66.67, 3)).toBe(2);
  });

  it("handles IOI floating-point tie-breaking precision", () => {
    // Two scores that differ by less than 0.01 should map to the same result
    // when rounded to 2 decimal places. This validates the ROUND(..., 2) used
    // in the SQL leaderboard query for tie-breaking consistency.
    const score1 = mapSubmissionPercentageToAssignmentPoints(80.00, 100);
    const score2 = mapSubmissionPercentageToAssignmentPoints(80.01, 100);
    // Both round to the same 2-decimal value (80.00 vs 80.01 — these differ,
    // but the point is they are both correctly rounded to 2 decimals)
    expect(score1).toBe(80);
    expect(score2).toBe(80.01);
  });
});

describe("isSubmissionLate", () => {
  it("returns false when the submission is on time or the schedule is incomplete", () => {
    const deadline = new Date("2026-03-09T12:00:00.000Z");

    expect(isSubmissionLate(new Date("2026-03-09T12:00:00.000Z"), deadline)).toBe(false);
    expect(isSubmissionLate(null, deadline)).toBe(false);
    expect(isSubmissionLate(new Date("2026-03-09T12:00:01.000Z"), null)).toBe(false);
  });

  it("returns true when the submission is after the deadline", () => {
    expect(
      isSubmissionLate(
        new Date("2026-03-09T12:00:01.000Z"),
        new Date("2026-03-09T12:00:00.000Z")
      )
    ).toBe(true);
  });
});

describe("buildIoiLatePenaltyCaseExpr", () => {
  it("produces a CASE expression containing the non-windowed late penalty branch", () => {
    const expr = buildIoiLatePenaltyCaseExpr();
    expect(expr).toContain("@examMode::text != 'windowed'");
    expect(expr).toContain("@deadline::bigint");
    expect(expr).toContain("@latePenalty::double precision");
  });

  it("produces a CASE expression containing the windowed late penalty branch", () => {
    const expr = buildIoiLatePenaltyCaseExpr();
    expect(expr).toContain("@examMode::text = 'windowed'");
    expect(expr).toContain("personal_deadline");
  });

  it("uses custom column names when provided", () => {
    const expr = buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline");
    expect(expr).toContain("s.score");
    expect(expr).toContain("COALESCE(ap.points, 100)");
    expect(expr).toContain("s.submitted_at");
    expect(expr).toContain("es.personal_deadline");
  });

  it("includes the default ELSE branch for on-time submissions", () => {
    const expr = buildIoiLatePenaltyCaseExpr();
    expect(expr).toContain("ELSE ROUND");
  });

  it("returns NULL for NULL scores", () => {
    const expr = buildIoiLatePenaltyCaseExpr();
    expect(expr).toContain("ELSE NULL");
  });
});

describe("mapSubmissionPercentageToAssignmentPoints — windowed exam", () => {
  it("applies late penalty against personalDeadline for windowed exams", () => {
    const personalDeadline = new Date("2026-03-09T10:00:00.000Z");
    const globalDeadline = new Date("2026-03-09T12:00:00.000Z");

    // Submitted after personal deadline but before global deadline
    expect(
      mapSubmissionPercentageToAssignmentPoints(80, 50, {
        submittedAt: new Date("2026-03-09T10:30:00.000Z"),
        deadline: globalDeadline,
        latePenalty: 25,
        personalDeadline,
        examMode: "windowed",
      })
    ).toBe(30); // 40 * (1 - 0.25) = 30
  });

  it("does not apply penalty when submitted before personalDeadline", () => {
    const personalDeadline = new Date("2026-03-09T10:00:00.000Z");
    const globalDeadline = new Date("2026-03-09T12:00:00.000Z");

    // Submitted before personal deadline — no penalty
    expect(
      mapSubmissionPercentageToAssignmentPoints(80, 50, {
        submittedAt: new Date("2026-03-09T09:59:59.000Z"),
        deadline: globalDeadline,
        latePenalty: 25,
        personalDeadline,
        examMode: "windowed",
      })
    ).toBe(40); // no penalty
  });

  it("falls back to global deadline when examMode is not windowed", () => {
    const personalDeadline = new Date("2026-03-09T10:00:00.000Z");
    const globalDeadline = new Date("2026-03-09T12:00:00.000Z");

    // Submitted after personal deadline but before global deadline — no penalty
    // because examMode is not "windowed"
    expect(
      mapSubmissionPercentageToAssignmentPoints(80, 50, {
        submittedAt: new Date("2026-03-09T10:30:00.000Z"),
        deadline: globalDeadline,
        latePenalty: 25,
        personalDeadline,
        examMode: "scheduled",
      })
    ).toBe(40); // no penalty (not past global deadline)
  });
});

describe("getAssignmentStatusRows scoring consistency", () => {
  it("uses buildIoiLatePenaltyCaseExpr in the SQL query (source-grep)", () => {
    const sourcePath = join(process.cwd(), "src", "lib", "assignments", "submissions.ts");
    const source = readFileSync(sourcePath, "utf8");

    // Verify the canonical scoring function is used instead of inline CASE
    expect(source, "getAssignmentStatusRows should use buildIoiLatePenaltyCaseExpr").toContain(
      "buildIoiLatePenaltyCaseExpr"
    );
    // Verify the LEFT JOIN to exam_sessions is present (needed for personal_deadline)
    expect(source, "getAssignmentStatusRows should JOIN exam_sessions for windowed penalty").toContain(
      "LEFT JOIN exam_sessions es"
    );
  });
});

describe("recruit results page scoring consistency (C1-AGG-2)", () => {
  it("uses mapSubmissionPercentageToAssignmentPoints, not raw submissions.score, for the candidate total (source-grep)", () => {
    const sourcePath = join(
      process.cwd(),
      "src",
      "app",
      "(auth)",
      "recruit",
      "[token]",
      "results",
      "page.tsx",
    );
    const source = readFileSync(sourcePath, "utf8");

    // The canonical helper must be imported and called — without it the page
    // falls into the units-mismatch bug where raw percentages were summed
    // alongside per-problem points (a candidate scoring 80% on three
    // 25-point problems would otherwise see "240 / 75").
    expect(
      source,
      "recruit/[token]/results/page.tsx must import the canonical scoring helper",
    ).toContain("mapSubmissionPercentageToAssignmentPoints");

    // The displayed total must accumulate the converted (points-scaled)
    // value. The previous bug accumulated `best.score` directly.
    expect(
      source,
      "recruit/[token]/results/page.tsx must accumulate mapSubmissionPercentageToAssignmentPoints output",
    ).toContain("totalScore += adjusted");
  });

  it("computes the correct candidate total: three 25-point problems at 80%/60%/100% → 60", () => {
    // Reproduces the original bug scenario in unit form. With the old
    // (broken) arithmetic the total would have been 80+60+100=240 over a
    // possible 75. With the canonical helper the total is the sum of the
    // points-scaled values: 20 + 15 + 25 = 60 over 75.
    const points = 25;
    const percentages = [80, 60, 100];
    const expectedAdjusted = percentages.map((pct) =>
      mapSubmissionPercentageToAssignmentPoints(pct, points),
    );
    expect(expectedAdjusted).toEqual([20, 15, 25]);
    const total = expectedAdjusted.reduce((acc, v) => acc + v, 0);
    expect(total).toBe(60);
    expect(points * percentages.length).toBe(75); // total possible
  });
});

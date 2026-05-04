import { mapSubmissionPercentageToAssignmentPoints } from "@/lib/assignments/scoring";

/**
 * Pure helpers for the recruit-results page (H-4) scoring math.
 *
 * Extracted from `src/app/(auth)/recruit/[token]/results/page.tsx` so the
 * candidate-facing total computation can be unit-tested without DOM/server-
 * component stubs. The previous inline implementation in the page made the
 * cycle-1 C1-AGG-2 units-mismatch regression (raw % accumulated alongside
 * per-problem points) hard to catch — keeping the math in a dedicated
 * module pins the contract behind the helper boundary. (cycle-3 CYC3-AGG-2.)
 *
 * Default per-problem points (when `assignmentProblems.points` is null) is
 * 100, matching the legacy assumption everywhere else in the codebase.
 */

export interface RecruitProblemRow {
  /** Problem identifier; the helper uses this only as a Map lookup key
   *  against the per-candidate `bestByProblem` Map. Never rendered. */
  problemId: string;
  /** Per-problem weight from `assignmentProblems.points`. When null, the
   *  helper defaults to 100 (matches the legacy assumption everywhere
   *  else in the codebase — see leaderboard / stats / assignment-status). */
  points: number | null;
}

export interface RecruitBestSubmission {
  /** Submission score as a percentage (0-100, source `submissions.score`).
   *  null means "no scored submission for this problem"; the helper skips
   *  null-score entries entirely. The helper does not validate the
   *  numeric range — `mapSubmissionPercentageToAssignmentPoints` clamps
   *  out-of-range values via Math.min/Math.max + the cycle-3 NaN guard. */
  score: number | null;
}

export interface RecruitResultsTotals {
  /** Map of problemId → adjusted (points-scaled) score. Only contains
   * problems with a non-null best score. Other problems are absent. */
  adjustedByProblem: Map<string, number>;
  /** Sum of `adjustedByProblem` values. */
  totalScore: number;
  /** Sum of per-problem `points` (with null defaulted to 100). */
  totalPossible: number;
}

/**
 * Compute the candidate-facing total score and per-problem adjusted scores.
 *
 * - `submissions.score` is a percentage (0-100); `assignmentProblems.points`
 *   is the per-problem weight. The total must use weighted points, not raw
 *   percentages — otherwise three 25-point problems at 80%/60%/100% would
 *   render as `240 / 75` instead of the expected `60 / 75`.
 * - This is the canonical helper. The leaderboard / stats / assignment-status
 *   SQL views use `buildIoiLatePenaltyCaseExpr()` for the same math at the
 *   DB layer; this helper covers the candidate-facing display path.
 *
 * @param assignmentProblemRows Per-problem rows from the assignment.
 * @param bestByProblem Map of problemId → best submission for that problem.
 *   The page builds this map by `ORDER BY submittedAt ASC` and keeping the
 *   highest score (ties resolve to earliest submission).
 * @returns adjustedByProblem, totalScore, totalPossible.
 *
 * @remarks
 * The helper reads only `points` from `RecruitProblemRow` and only `score`
 * from `RecruitBestSubmission`. Callers may pass wider Map values
 * (e.g., the page passes a Map of full submission rows that structurally
 * fit `RecruitBestSubmission` because each row has a `score: number | null`
 * field). If a future change to this helper reads additional fields from
 * `RecruitBestSubmission`, callers MUST narrow the input Map to ensure
 * the new fields are populated — TypeScript structural width-subtyping
 * silently accepts wider Maps and would otherwise hide a missing-field
 * regression. (cycle-4 CYC4-AGG-2.)
 */
export function computeRecruitResultsTotals(
  assignmentProblemRows: ReadonlyArray<RecruitProblemRow>,
  bestByProblem: ReadonlyMap<string, RecruitBestSubmission>,
): RecruitResultsTotals {
  const adjustedByProblem = new Map<string, number>();
  let totalScore = 0;
  let totalPossible = 0;
  for (const ap of assignmentProblemRows) {
    const points = ap.points ?? 100;
    totalPossible += points;
    const best = bestByProblem.get(ap.problemId);
    if (best?.score !== null && best?.score !== undefined && Number.isFinite(best.score)) {
      const adjusted = mapSubmissionPercentageToAssignmentPoints(best.score, points);
      adjustedByProblem.set(ap.problemId, adjusted);
      totalScore += adjusted;
    }
  }
  return { adjustedByProblem, totalScore, totalPossible };
}

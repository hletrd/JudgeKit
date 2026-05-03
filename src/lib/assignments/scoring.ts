function roundAssignmentScore(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Map a submission's percentage score to assignment points, applying late penalties.
 *
 * NOTE: For SQL-level scoring (leaderboard, stats, assignment status page),
 * prefer `buildIoiLatePenaltyCaseExpr()` which is the canonical source of truth.
 * This TypeScript function is provided for contexts where SQL-level computation
 * is not available (e.g., client-side display logic).
 */
export function mapSubmissionPercentageToAssignmentPoints(
  score: number,
  points: number,
  lateContext?: {
    submittedAt: Date | null;
    deadline: Date | null;
    latePenalty: number;
    /** Per-user personal deadline for windowed exams. When provided and the
     *  exam mode is windowed, the late penalty is applied against this deadline
     *  instead of the global deadline. */
    personalDeadline?: Date | null;
    /** Exam mode — when 'windowed', the personalDeadline is used for late checks. */
    examMode?: string;
  }
) {
  // Guard against NaN/Infinity propagation. Math.min/Math.max preserve NaN,
  // which would produce a `NaN / N` rendering on the candidate-facing
  // recruit-results page. Treat any non-finite input as zero so the page
  // never displays a non-numeric total. (cycle-3 CYC3-AGG-6).
  if (!Number.isFinite(score)) {
    return 0;
  }
  const normalizedPercentage = Math.min(Math.max(score, 0), 100);
  let earnedPoints = roundAssignmentScore((normalizedPercentage / 100) * points);

  if (lateContext && lateContext.submittedAt && lateContext.latePenalty > 0) {
    const submittedTime = lateContext.submittedAt.valueOf();

    // For windowed exams, apply late penalty against the personal deadline
    if (lateContext.examMode === "windowed" && lateContext.personalDeadline) {
      const personalDeadlineTime = lateContext.personalDeadline.valueOf();
      if (submittedTime > personalDeadlineTime) {
        const penaltyFraction = lateContext.latePenalty / 100;
        earnedPoints = roundAssignmentScore(earnedPoints * (1 - penaltyFraction));
      }
    } else if (lateContext.deadline) {
      // Non-windowed: apply late penalty against the global deadline
      const deadlineTime = lateContext.deadline.valueOf();
      if (submittedTime > deadlineTime) {
        const penaltyFraction = lateContext.latePenalty / 100;
        earnedPoints = roundAssignmentScore(earnedPoints * (1 - penaltyFraction));
      }
    }
  }

  return earnedPoints;
}

export function isSubmissionLate(submittedAt: Date | null, deadline: Date | null): boolean {
  if (!submittedAt || !deadline) return false;
  return submittedAt.valueOf() > deadline.valueOf();
}

/**
 * SECURITY CONTRACT (PRIMARY): Callers MUST pass only hardcoded string
 * literals or Drizzle column reference names. NEVER pass user-influenced
 * input. This validator is a **defence-in-depth backstop**, not the
 * primary defence — column names are interpolated directly into SQL.
 *
 * The validator allows safe identifier patterns (alphanumeric, underscores,
 * dots), SQL function calls (parentheses, commas, spaces), and numeric
 * literals — the patterns used by current callers like
 * `COALESCE(ap.points, 100)` and `s.score`.
 *
 * Defence-in-depth: rejects dangerous characters and a non-exhaustive
 * blocklist of dangerous SQL keywords. The blocklist may NOT include every
 * dangerous keyword — `TRUNCATE`, `GRANT`, `REVOKE`, `MERGE`, `CALL`,
 * `LOCK` are intentionally NOT blocked because the primary defence is the
 * caller-contract above. The negative-path test suite in
 * `tests/unit/assignments/scoring.test.ts` pins the current rejection
 * contract.
 *
 * Rejected characters: semicolon, double-hyphen, slash-star, star-slash,
 *   single quote, double quote, backslash.
 * Rejected SQL keywords (case-insensitive, whole-word boundary):
 *   `DELETE`, `DROP`, `INSERT`, `UPDATE`, `ALTER`, `CREATE`, `EXEC`,
 *   `EXECUTE`.
 *
 * Note: identifiers that *contain* a keyword as a substring (e.g.
 * `DROP_test`) are NOT rejected because the underscore is a word
 * character, so `\bDROP\b` does not match. This is intentional —
 * identifier substring collisions are acceptable; only standalone
 * keyword payloads are blocked.
 *
 * @security If a future caller passes anything user-influenced, the
 *   validator is INSUFFICIENT — tighten this regex to an allowlist before
 *   permitting that caller pattern. See cycle-3 CYC3-AGG-4 / CYC3-AGG-7.
 */
const SQL_COLUMN_NAME_RE = /^[a-zA-Z0-9_.,() ]+$/;
const SQL_COLUMN_DANGEROUS_RE = /;|--|\/\*|\*\/|'|"|\\|\b(DELETE|DROP|INSERT|UPDATE|ALTER|CREATE|EXEC|EXECUTE)\b/i;
function validateSqlColumnName(name: string, paramName: string): string {
  if (!SQL_COLUMN_NAME_RE.test(name) || SQL_COLUMN_DANGEROUS_RE.test(name)) {
    throw new Error(
      `Invalid SQL column expression for ${paramName}: "${name}". ` +
      "Only safe SQL identifier/expression patterns are allowed. " +
      "Never pass user-influenced input as a column name."
    );
  }
  return name;
}

/**
 * SQL fragment for the IOI late-penalty CASE expression.
 *
 * This is the single source of truth for the late-penalty scoring logic used
 * in both the main leaderboard query (`contest-scoring.ts`) and the single-user
 * live-rank query (`leaderboard.ts`). Keeping it in one place ensures both
 * queries stay in sync when new exam modes or penalty rules are added.
 *
 * Returns a SQL CASE expression that computes the adjusted score for a single
 * submission row. The caller must ensure:
 * - `@deadline`, `@latePenalty`, `@examMode` parameters are bound.
 * - For the windowed branch, `personal_deadline` is available in the FROM
 *   clause (via LEFT JOIN exam_sessions).
 * - `score` and `points` (or an alias like `COALESCE(ap.points, 100)`) are
 *   available as column references.
 *
 * @security Column name parameters are interpolated directly into SQL.
 *   They are validated against a safe identifier pattern, but callers MUST
 *   only pass trusted column names (hardcoded literals or Drizzle references)
 *   and NEVER user-influenced input.
 *
 * @param scoreCol  SQL column reference for the raw submission score (e.g. `score` or `s.score`).
 * @param pointsCol SQL column reference for the max points (e.g. `points` or `COALESCE(ap.points, 100)`).
 */
export function buildIoiLatePenaltyCaseExpr(
  scoreCol: string = "score",
  pointsCol: string = "points",
  submittedAtCol: string = "submitted_at",
  personalDeadlineCol: string = "personal_deadline",
): string {
  // Validate column names before SQL interpolation to prevent injection.
  const safeScoreCol = validateSqlColumnName(scoreCol, "scoreCol");
  const safePointsCol = validateSqlColumnName(pointsCol, "pointsCol");
  const safeSubmittedAtCol = validateSqlColumnName(submittedAtCol, "submittedAtCol");
  const safePersonalDeadlineCol = validateSqlColumnName(personalDeadlineCol, "personalDeadlineCol");
  return `CASE
    WHEN ${safeScoreCol} IS NOT NULL THEN
      CASE
        -- Non-windowed: late penalty against the global deadline
        WHEN @deadline::bigint IS NOT NULL AND @latePenalty::double precision > 0 AND @examMode::text != 'windowed'
             AND ${safeSubmittedAtCol} IS NOT NULL AND EXTRACT(EPOCH FROM ${safeSubmittedAtCol})::bigint > @deadline::bigint
        THEN ROUND(((LEAST(GREATEST(${safeScoreCol}, 0), 100) / 100.0 * ${safePointsCol}) * (1.0 - @latePenalty::double precision / 100.0))::numeric, 2)
        -- Windowed: late penalty against the per-user personal_deadline
        WHEN @examMode::text = 'windowed' AND @latePenalty::double precision > 0
             AND ${safePersonalDeadlineCol} IS NOT NULL
             AND ${safeSubmittedAtCol} IS NOT NULL AND ${safeSubmittedAtCol} > ${safePersonalDeadlineCol}
        THEN ROUND(((LEAST(GREATEST(${safeScoreCol}, 0), 100) / 100.0 * ${safePointsCol}) * (1.0 - @latePenalty::double precision / 100.0))::numeric, 2)
        ELSE ROUND((LEAST(GREATEST(${safeScoreCol}, 0), 100) / 100.0 * ${safePointsCol})::numeric, 2)
      END
    ELSE NULL
  END`;
}

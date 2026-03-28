import { sqlite } from "@/lib/db";
import type { ScoringModel } from "@/types";

/**
 * ICPC penalty: minutes from contest start to first AC + 20 min per wrong attempt before AC.
 */
export function computeIcpcPenalty(
  contestStartMs: number,
  firstAcMs: number,
  wrongAttempts: number
): number {
  const minutesToAc = Math.floor((firstAcMs - contestStartMs) / 60_000);
  return minutesToAc + wrongAttempts * 20;
}

export type LeaderboardProblemResult = {
  problemId: string;
  /** IOI: best adjusted score. ICPC: full points or 0. */
  score: number;
  /** Number of attempts */
  attempts: number;
  /** Whether this problem is accepted (score === full points for ICPC, score > 0 for IOI) */
  solved: boolean;
  /** Timestamp of first AC (ms), null if not solved */
  firstAcAt: number | null;
  /** ICPC penalty contribution for this problem (0 if not solved) */
  penalty: number;
};

export type LeaderboardEntry = {
  userId: string;
  username: string;
  name: string;
  className: string | null;
  rank: number;
  /** IOI: total adjusted score. ICPC: number of problems solved. */
  totalScore: number;
  /** ICPC only: total penalty */
  totalPenalty: number;
  /** Per-problem breakdown */
  problems: LeaderboardProblemResult[];
};

const rankingCache = new Map<string, { data: { scoringModel: ScoringModel; entries: LeaderboardEntry[] }; timestamp: number }>();
const RANKING_CACHE_TTL_MS = 15_000; // 15 seconds

function getCachedRanking(key: string) {
  const cached = rankingCache.get(key);
  if (cached && Date.now() - cached.timestamp < RANKING_CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

function setCachedRanking(key: string, data: { scoringModel: ScoringModel; entries: LeaderboardEntry[] }) {
  rankingCache.set(key, { data, timestamp: Date.now() });
  // Prevent unbounded cache growth — O(n) linear scan for min timestamp
  if (rankingCache.size > 50) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of rankingCache) {
      if (v.timestamp < oldestTs) {
        oldestTs = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) rankingCache.delete(oldestKey);
  }
}

type RawLeaderboardRow = {
  userId: string;
  username: string;
  name: string;
  className: string | null;
  problemId: string;
  points: number;
  attemptCount: number;
  bestScore: number | null;
  hasAc: number;
  firstAcAt: number | null;
  wrongBeforeAc: number;
};

type AssignmentMetaRow = {
  scoringModel: string;
  startsAt: number | null;
  deadline: number | null;
  latePenalty: number | null;
  examMode: string;
};

/**
 * Compute contest ranking for both IOI and ICPC models.
 * Returns a sorted leaderboard with per-problem breakdowns.
 * @param cutoffSec Optional Unix timestamp (seconds) to filter submissions before this time (for freeze).
 */
export function computeContestRanking(assignmentId: string, cutoffSec?: number): {
  scoringModel: ScoringModel;
  entries: LeaderboardEntry[];
} {
  const cacheKey = `${assignmentId}:${cutoffSec ?? 'live'}`;
  const cached = getCachedRanking(cacheKey);
  if (cached) return cached;

  // Get assignment metadata, scoring rows, and problem list in a single
  // read transaction to ensure a consistent snapshot across all three queries.
  function buildScoringQuery(withCutoff: boolean): string {
    return `
      WITH base AS (
        SELECT
          s.user_id,
          s.problem_id,
          s.score,
          s.submitted_at,
          COALESCE(ap.points, 100) AS points,
          u.username,
          u.name,
          u.class_name,
          MIN(CASE WHEN s.score = 100 THEN s.submitted_at ELSE NULL END)
            OVER (PARTITION BY s.user_id, s.problem_id) AS first_ac_at
        FROM submissions s
        INNER JOIN assignment_problems ap
          ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.assignment_id = ?${withCutoff ? " AND s.submitted_at <= ?" : ""}
      )
      SELECT
        user_id AS userId,
        username,
        name,
        class_name AS className,
        problem_id AS problemId,
        points,
        COUNT(*) AS attemptCount,
        MAX(
          CASE
            WHEN score IS NOT NULL THEN
              CASE
                WHEN ? IS NOT NULL AND ? > 0 AND ? != 'windowed'
                     AND submitted_at IS NOT NULL AND submitted_at > ?
                THEN ROUND(MIN(MAX(score, 0), 100) / 100.0 * points, 2)
                     * (1.0 - ? / 100.0)
                ELSE ROUND(MIN(MAX(score, 0), 100) / 100.0 * points, 2)
              END
            ELSE NULL
          END
        ) AS bestScore,
        MAX(CASE WHEN score = 100 THEN 1 ELSE 0 END) AS hasAc,
        MIN(CASE WHEN score = 100 THEN submitted_at ELSE NULL END) AS firstAcAt,
        SUM(CASE WHEN (score IS NULL OR score < 100)
                  AND submitted_at < COALESCE(first_ac_at, 9999999999)
             THEN 1 ELSE 0 END) AS wrongBeforeAc
      FROM base
      GROUP BY user_id, problem_id
    `;
  }

  const { meta, rows, assignmentProblemRows } = sqlite.transaction(() => {
    const meta = sqlite
      .prepare<[string], AssignmentMetaRow>(
        `SELECT scoring_model AS scoringModel, starts_at AS startsAt, deadline, late_penalty AS latePenalty, exam_mode AS examMode
         FROM assignments WHERE id = ?`
      )
      .get(assignmentId);

    if (!meta) {
      return { meta: null, rows: [] as RawLeaderboardRow[], assignmentProblemRows: [] as { problemId: string; points: number }[] };
    }

    // Positional params:
    //   assignmentId, [cutoffSec], deadlineSec, latePenalty, examMode, deadlineSec, latePenalty
    const rows =
      cutoffSec != null
        ? sqlite
            .prepare<[string, number, number | null, number, string, number | null, number], RawLeaderboardRow>(buildScoringQuery(true))
            .all(assignmentId, cutoffSec, meta.deadline, meta.latePenalty ?? 0, meta.examMode ?? "none", meta.deadline, meta.latePenalty ?? 0)
        : sqlite
            .prepare<[string, number | null, number, string, number | null, number], RawLeaderboardRow>(buildScoringQuery(false))
            .all(assignmentId, meta.deadline, meta.latePenalty ?? 0, meta.examMode ?? "none", meta.deadline, meta.latePenalty ?? 0);

    const assignmentProblemRows = sqlite
      .prepare<[string], { problemId: string; points: number }>(
        `SELECT problem_id AS problemId, COALESCE(points, 100) AS points
         FROM assignment_problems WHERE assignment_id = ? ORDER BY sort_order, problem_id`
      )
      .all(assignmentId);

    return { meta, rows, assignmentProblemRows };
  })();

  if (!meta) {
    return { scoringModel: "ioi", entries: [] };
  }

  const scoringModel = (meta.scoringModel ?? "ioi") as ScoringModel;
  const contestStartMs = meta.startsAt ? meta.startsAt * 1000 : 0;
  const deadlineSec = meta.deadline;
  const latePenalty = meta.latePenalty ?? 0;

  // Group by user
  const userMap = new Map<
    string,
    {
      username: string;
      name: string;
      className: string | null;
      problems: Map<string, RawLeaderboardRow>;
    }
  >();

  for (const row of rows) {
    if (!userMap.has(row.userId)) {
      userMap.set(row.userId, {
        username: row.username,
        name: row.name,
        className: row.className,
        problems: new Map(),
      });
    }
    userMap.get(row.userId)!.problems.set(row.problemId, row);
  }

  // Get all problem IDs in assignment order
  const assignmentProblems = assignmentProblemRows;

  // Build leaderboard entries
  const entries: LeaderboardEntry[] = [];

  for (const [userId, userData] of userMap) {
    const problemResults: LeaderboardProblemResult[] = assignmentProblems.map(
      (ap) => {
        const row = userData.problems.get(ap.problemId);
        if (!row) {
          return {
            problemId: ap.problemId,
            score: 0,
            attempts: 0,
            solved: false,
            firstAcAt: null,
            penalty: 0,
          };
        }

        if (scoringModel === "icpc") {
          const solved = row.hasAc === 1;
          const firstAcMs = row.firstAcAt ? row.firstAcAt * 1000 : null;
          const penalty =
            solved && firstAcMs
              ? computeIcpcPenalty(contestStartMs, firstAcMs, row.wrongBeforeAc)
              : 0;

          return {
            problemId: ap.problemId,
            score: solved ? ap.points : 0,
            attempts: row.attemptCount,
            solved,
            firstAcAt: firstAcMs,
            penalty,
          };
        }

        // IOI
        return {
          problemId: ap.problemId,
          score: row.bestScore ?? 0,
          attempts: row.attemptCount,
          solved: (row.bestScore ?? 0) >= ap.points,
          firstAcAt: row.firstAcAt ? row.firstAcAt * 1000 : null,
          penalty: 0,
        };
      }
    );

    if (scoringModel === "icpc") {
      const solvedCount = problemResults.filter((p) => p.solved).length;
      const totalPenalty = problemResults.reduce((s, p) => s + p.penalty, 0);

      entries.push({
        userId,
        username: userData.username,
        name: userData.name,
        className: userData.className,
        rank: 0,
        totalScore: solvedCount,
        totalPenalty,
        problems: problemResults,
      });
    } else {
      const totalScore = problemResults.reduce((s, p) => s + p.score, 0);

      entries.push({
        userId,
        username: userData.username,
        name: userData.name,
        className: userData.className,
        rank: 0,
        totalScore,
        totalPenalty: 0,
        problems: problemResults,
      });
    }
  }

  // Sort and assign ranks
  if (scoringModel === "icpc") {
    entries.sort((a, b) => {
      // More problems solved first
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      // Less penalty first
      if (a.totalPenalty !== b.totalPenalty) return a.totalPenalty - b.totalPenalty;
      // Earlier last AC first
      const aLastAc = Math.max(...a.problems.filter((p) => p.solved).map((p) => p.firstAcAt ?? 0), 0);
      const bLastAc = Math.max(...b.problems.filter((p) => p.solved).map((p) => p.firstAcAt ?? 0), 0);
      return aLastAc - bLastAc;
    });
  } else {
    entries.sort((a, b) => b.totalScore - a.totalScore);
  }

  // Assign ranks (tied entries get the same rank)
  let currentRank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) {
      const prev = entries[i - 1];
      const curr = entries[i];
      const tied =
        scoringModel === "icpc"
          ? prev.totalScore === curr.totalScore && prev.totalPenalty === curr.totalPenalty
          : prev.totalScore === curr.totalScore;
      if (!tied) {
        currentRank = i + 1;
      }
    }
    entries[i].rank = currentRank;
  }

  const result = { scoringModel, entries };
  setCachedRanking(cacheKey, result);
  return result;
}

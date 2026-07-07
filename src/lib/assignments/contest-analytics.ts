import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
import { TERMINAL_SUBMISSION_STATUSES_SQL_LIST } from "@/lib/submissions/status";
import { computeContestRanking } from "./contest-scoring";
import { mapSubmissionPercentageToAssignmentPoints } from "./scoring";

type HistogramBucket = {
  label: string;
  min: number;
  max: number;
  count: number;
};

type ProblemSolveRate = {
  problemId: string;
  title: string;
  points: number;
  solved: number;
  partial: number;
  zero: number;
  total: number;
  solvedPercent: number;
  partialPercent: number;
  zeroPercent: number;
};

type TimelinePoint = {
  timestamp: number;
  cumulativeSolveCount: number;
};

type ProblemTimeline = {
  problemId: string;
  title: string;
  points: TimelinePoint[];
};

type StudentProgression = {
  userId: string;
  name: string;
  points: Array<{ timestamp: number; totalScore: number }>;
};

type ProblemSolveTime = {
  problemId: string;
  title: string;
  medianMinutes: number;
  meanMinutes: number;
  solveCount: number;
};

type CheatSummary = {
  totalEvents: number;
  byType: Record<string, number>;
  flaggedStudents: Array<{
    userId: string;
    name: string;
    username: string;
    eventCount: number;
  }>;
};

export type ContestAnalytics = {
  scoreDistribution: HistogramBucket[];
  problemSolveRates: ProblemSolveRate[];
  solveTimelines?: ProblemTimeline[];
  studentProgressions?: StudentProgression[];
  problemSolveTimes: ProblemSolveTime[];
  cheatSummary: CheatSummary;
};

type ProblemRow = {
  problemId: string;
  title: string;
  points: number;
};

type SubmissionTimeRow = {
  userId: string;
  name: string;
  problemId: string;
  score: number | null;
  submittedAt: Date;
  points: number;
};

type CheatCountRow = {
  userId: string;
  name: string;
  username: string;
  eventType: string;
  count: number;
};

export async function computeContestAnalytics(assignmentId: string, includeTimeline = false): Promise<ContestAnalytics> {
  const { scoringModel, entries } = await computeContestRanking(assignmentId);

  const problems = await rawQueryAll<ProblemRow>(
    `SELECT ap.problem_id AS "problemId", p.title, COALESCE(ap.points, 100) AS points
     FROM assignment_problems ap
     INNER JOIN problems p ON p.id = ap.problem_id
     WHERE ap.assignment_id = @assignmentId
     ORDER BY ap.sort_order, p.title`,
    { assignmentId }
  );

  // 1. Score distribution
  const totalPointsPossible = problems.reduce((s, p) => s + Number(p.points), 0);
  const scoreDistribution: HistogramBucket[] = [];
  for (let i = 0; i < 10; i++) {
    const min = i * 10;
    const max = i === 9 ? 100 : (i + 1) * 10;
    scoreDistribution.push({ label: `${min}-${max}%`, min, max, count: 0 });
  }

  for (const entry of entries) {
    const numericScore = Number(entry.totalScore ?? 0);
    const safeScore = Number.isFinite(numericScore) ? numericScore : 0;
    // ICPC totalScore is the COUNT of solved problems (contest-scoring.ts),
    // not points — dividing it by totalPointsPossible put every participant
    // in the 0-10% bucket (RPF cycle-1 M10). Bucket ICPC entries by the
    // fraction of problems solved instead.
    const pct =
      scoringModel === "icpc"
        ? problems.length > 0
          ? (safeScore / problems.length) * 100
          : 0
        : totalPointsPossible > 0
          ? (safeScore / totalPointsPossible) * 100
          : 0;
    const bucketIdx = Number.isFinite(pct)
      ? Math.min(Math.max(Math.floor(pct / 10), 0), 9)
      : 0;
    scoreDistribution[bucketIdx].count++;
  }

  // 2. Per-problem solve rates
  // Build a lookup map from entry.problems for O(1) access
  const entryProblemMaps = entries.map((entry) => {
    const map = new Map(entry.problems.map((ep) => [ep.problemId, ep]));
    return map;
  });

  const problemSolveRates: ProblemSolveRate[] = problems.map((p) => {
    let solved = 0;
    let partial = 0;
    let zero = 0;

    for (const epMap of entryProblemMaps) {
      const pr = epMap.get(p.problemId);
      if (!pr || pr.attempts === 0) {
        zero++;
      } else if (pr.score >= p.points) {
        solved++;
      } else if (pr.score > 0) {
        partial++;
      } else {
        zero++;
      }
    }

    const total = entries.length || 1;
    return {
      problemId: p.problemId,
      title: p.title,
      points: p.points,
      solved,
      partial,
      zero,
      total: entries.length,
      solvedPercent: Math.round((solved / total) * 100),
      partialPercent: Math.round((partial / total) * 100),
      zeroPercent: Math.round((zero / total) * 100),
    };
  });

  // 3. First-AC map — needed for both timeline and solve times
  // Keyed by problemId -> userId -> timestamp (seconds) for O(1) per-problem
  // lookup. Previous `endsWith` matching could produce false matches when one
  // problem ID is a suffix of another.
  //
  // SCORING SEMANTICS NOTE: The `ROUND(s.score, 2) = 100` filter checks the
  // raw submission score, not the adjusted score after late penalties. This is
  // correct for ICPC scoring where a raw score of 100 means "fully accepted".
  // For IOI scoring with late penalties, a raw score of 100 may have an
  // adjusted score < 100 (e.g., 90 after a 10% late penalty), so the "first AC"
  // concept here represents "first full raw score" rather than "first full
  // adjusted score". The main leaderboard in contest-scoring.ts correctly uses
  // adjusted scores for ranking. The student progression chart (section 4 below)
  // also uses adjusted scores for consistency with the leaderboard.
  //
  // Parallelize the independent queries: first-AC, contest meta, and cheat
  // summary can all run concurrently since they don't depend on each other.
  const [allAcSubs, contestMeta, cheatRows] = await Promise.all([
    rawQueryAll<{ userId: string; problemId: string; submittedAt: Date }>(
      // Only the FIRST AC per (user, problem) is used downstream, so collapse to
      // one row each with DISTINCT ON instead of scanning every AC submission.
      `SELECT DISTINCT ON (s.user_id, s.problem_id)
              s.user_id AS "userId", s.problem_id AS "problemId", s.submitted_at AS "submittedAt"
       FROM submissions s
       WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
         AND ROUND(s.score::numeric, 2) = 100
       ORDER BY s.user_id, s.problem_id, s.submitted_at ASC`,
      { assignmentId }
    ),
    rawQueryOne<{ startsAt: Date | null; deadline: Date | null; latePenalty: number | null; examMode: string }>(
      `SELECT starts_at AS "startsAt", deadline, late_penalty AS "latePenalty", exam_mode AS "examMode" FROM assignments WHERE id = @assignmentId`,
      { assignmentId }
    ),
    rawQueryAll<CheatCountRow>(
      `SELECT ace.user_id AS "userId", u.name, u.username, ace.event_type AS "eventType", COUNT(*) AS count
       FROM anti_cheat_events ace
       INNER JOIN users u ON u.id = ace.user_id
       WHERE ace.assignment_id = @assignmentId
       GROUP BY ace.user_id, u.name, u.username, ace.event_type
       ORDER BY count DESC`,
      { assignmentId }
    ),
  ]);

  const firstAcMap = new Map<string, Map<string, number>>();
  for (const sub of allAcSubs) {
    let problemMap = firstAcMap.get(sub.problemId);
    if (!problemMap) {
      problemMap = new Map();
      firstAcMap.set(sub.problemId, problemMap);
    }
    if (!problemMap.has(sub.userId)) {
      // Store as unix seconds for compatibility with existing logic
      problemMap.set(sub.userId, Math.floor(new Date(sub.submittedAt).getTime() / 1000));
    }
  }

  // 3a. Solve timeline: per-problem cumulative AC count over time (only when requested)
  let solveTimelines: ProblemTimeline[] | undefined;
  if (includeTimeline) {
    solveTimelines = problems.map((p) => {
      const problemMap = firstAcMap.get(p.problemId);
      const firstAcTimes: number[] = problemMap ? Array.from(problemMap.values()) : [];
      firstAcTimes.sort((a, b) => a - b);

      const points: TimelinePoint[] = firstAcTimes.map((ts, idx) => ({
        timestamp: ts * 1000,
        cumulativeSolveCount: idx + 1,
      }));

      return { problemId: p.problemId, title: p.title, points };
    });
  }

  // 4. Student score progression (only when requested)
  // Applies late penalties using mapSubmissionPercentageToAssignmentPoints()
  // for full consistency with the leaderboard (which uses buildIoiLatePenaltyCaseExpr
  // at the SQL level). Both share the same late-penalty semantics: non-windowed
  // exams check against the global deadline, windowed exams check against the
  // per-user personal_deadline.
  let studentProgressions: StudentProgression[] | undefined;
  if (includeTimeline) {
    const submissionRows = await rawQueryAll<SubmissionTimeRow & { personalDeadline: Date | null }>(
      // The progression only adds a point when a submission raises the user's
      // best for a problem; since late penalties are non-decreasing over time,
      // any adjusted-score improvement implies a RAW-score improvement. So keep
      // only raw record-breakers per (user, problem) via a window function — a
      // superset of the points the JS will emit — instead of scanning every
      // submission row. Output is identical; row count drops from O(all subs).
      `SELECT "userId", name, "problemId", score, "submittedAt", points, "personalDeadline"
       FROM (
         SELECT s.user_id AS "userId", u.name, s.problem_id AS "problemId", s.score, s.submitted_at AS "submittedAt",
                COALESCE(ap.points, 100) AS points,
                es.personal_deadline AS "personalDeadline",
                MAX(s.score) OVER (
                  PARTITION BY s.user_id, s.problem_id
                  ORDER BY s.submitted_at ASC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ) AS prev_best
         FROM submissions s
         INNER JOIN users u ON u.id = s.user_id
         INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
         LEFT JOIN exam_sessions es ON es.assignment_id = s.assignment_id AND es.user_id = s.user_id
         WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
       ) ranked
       WHERE prev_best IS NULL OR score > prev_best
       ORDER BY "submittedAt" ASC`,
      { assignmentId }
    );

    const latePenalty = contestMeta?.latePenalty ?? 0;
    const deadline = contestMeta?.deadline ?? null;
    const examMode = contestMeta?.examMode ?? "none";

    const userProgressMap = new Map<string, { name: string; bestScores: Map<string, number>; progressionPoints: Array<{ timestamp: number; totalScore: number }> }>();

    for (const sub of submissionRows) {
      if (!userProgressMap.has(sub.userId)) {
        userProgressMap.set(sub.userId, { name: sub.name, bestScores: new Map(), progressionPoints: [] });
      }
      const userData = userProgressMap.get(sub.userId);
      if (!userData) continue;
      const adjustedScore = sub.score != null
        ? mapSubmissionPercentageToAssignmentPoints(Number(sub.score), Number(sub.points), {
            submittedAt: new Date(sub.submittedAt),
            deadline,
            latePenalty,
            personalDeadline: sub.personalDeadline ? new Date(sub.personalDeadline) : null,
            examMode,
          })
        : 0;
      const currentBest = userData.bestScores.get(sub.problemId) ?? 0;
      const submittedAtMs = new Date(sub.submittedAt).getTime();

      if (adjustedScore > currentBest) {
        userData.bestScores.set(sub.problemId, adjustedScore);
        const totalScore = Array.from(userData.bestScores.values()).reduce((s, v) => s + v, 0);
        userData.progressionPoints.push({ timestamp: submittedAtMs, totalScore });
      }
    }

    studentProgressions = Array.from(userProgressMap.entries()).map(([userId, data]) => ({
      userId,
      name: data.name,
      points: data.progressionPoints,
    }));
  }

  // 5. Per-problem solve time (median/mean time from contest start to first AC)
  // contestMeta is already fetched in the parallel batch above.
  const contestStartSec = contestMeta?.startsAt ? Math.floor(new Date(contestMeta.startsAt).getTime() / 1000) : 0;

  const problemSolveTimes: ProblemSolveTime[] = problems.map((p) => {
    const problemMap = firstAcMap.get(p.problemId);
    const solveTimes: number[] = problemMap
      ? Array.from(problemMap.values()).map((ts) => Math.max(0, (ts - contestStartSec) / 60))
      : [];
    solveTimes.sort((a, b) => a - b);

    const solveCount = solveTimes.length;
    const meanMinutes = solveCount > 0 ? Math.round(solveTimes.reduce((s, v) => s + v, 0) / solveCount) : 0;
    const medianMinutes = solveCount > 0
      ? Math.round(solveCount % 2 === 1 ? solveTimes[Math.floor(solveCount / 2)] : (solveTimes[solveCount / 2 - 1] + solveTimes[solveCount / 2]) / 2)
      : 0;

    return { problemId: p.problemId, title: p.title, medianMinutes, meanMinutes, solveCount };
  });

  // 6. Cheat summary
  // cheatRows is already fetched in the parallel batch above.

  const byType: Record<string, number> = {};
  const studentEventCounts = new Map<string, { name: string; username: string; count: number }>();
  let totalEvents = 0;

  for (const row of cheatRows) {
    byType[row.eventType] = (byType[row.eventType] ?? 0) + Number(row.count);
    totalEvents += Number(row.count);
    const existing = studentEventCounts.get(row.userId);
    if (existing) {
      existing.count += Number(row.count);
    } else {
      studentEventCounts.set(row.userId, { name: row.name, username: row.username, count: Number(row.count) });
    }
  }

  const flaggedStudents = Array.from(studentEventCounts.entries())
    .map(([userId, data]) => ({ userId, name: data.name, username: data.username, eventCount: data.count }))
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 20);

  const cheatSummary: CheatSummary = { totalEvents, byType, flaggedStudents };

  return {
    scoreDistribution,
    problemSolveRates,
    solveTimelines,
    studentProgressions,
    problemSolveTimes,
    cheatSummary,
  };
}

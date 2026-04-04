import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
import { computeContestRanking } from "./contest-scoring";
import type { LeaderboardEntry } from "./contest-scoring";
import type { ScoringModel } from "@/types";

type AssignmentFreezeRow = {
  freezeLeaderboardAt: Date | null;
  scoringModel: string;
  startsAt: Date | null;
};

type FrozenLeaderboardResult = {
  scoringModel: ScoringModel;
  entries: LeaderboardEntry[];
  frozen: boolean;
  frozenAt: number | null;
  startsAt: number | null;
};

/**
 * Get the problem list for the leaderboard header.
 */
export async function getLeaderboardProblems(assignmentId: string): Promise<{ problemId: string; title: string; points: number; sortOrder: number }[]> {
  return rawQueryAll<{ problemId: string; title: string; points: number; sortOrder: number }>(
    `SELECT ap.problem_id AS "problemId", p.title, COALESCE(ap.points, 100) AS points, COALESCE(ap.sort_order, 0) AS "sortOrder"
     FROM assignment_problems ap
     INNER JOIN problems p ON p.id = ap.problem_id
     WHERE ap.assignment_id = @assignmentId
     ORDER BY ap.sort_order, p.title`,
    { assignmentId }
  );
}

/**
 * Compute leaderboard with freeze support.
 * - For instructors/admins: always returns live data with `frozen: false`
 * - For students: returns frozen data if past freeze time, using cutoff filtering
 */
export async function computeLeaderboard(
  assignmentId: string,
  isInstructorView: boolean
): Promise<FrozenLeaderboardResult> {
  const meta = await rawQueryOne<AssignmentFreezeRow>(
    `SELECT freeze_leaderboard_at AS "freezeLeaderboardAt", scoring_model AS "scoringModel", starts_at AS "startsAt" FROM assignments WHERE id = @assignmentId`,
    { assignmentId }
  );

  const freezeAt = meta?.freezeLeaderboardAt ? new Date(meta.freezeLeaderboardAt).getTime() : null;
  const startsAt = meta?.startsAt ? new Date(meta.startsAt).getTime() : null;
  const nowMs = Date.now();
  const isFrozen = !isInstructorView && freezeAt != null && nowMs >= freezeAt;

  if (isFrozen && freezeAt) {
    // Compute ranking using only submissions before freeze time
    const freezeSec = Math.floor(freezeAt / 1000);
    const { scoringModel, entries } = await computeContestRanking(assignmentId, freezeSec);
    return {
      scoringModel,
      entries,
      frozen: true,
      frozenAt: freezeAt,
      startsAt,
    };
  }

  const { scoringModel, entries } = await computeContestRanking(assignmentId);

  return {
    scoringModel,
    entries,
    frozen: false,
    frozenAt: freezeAt,
    startsAt,
  };
}

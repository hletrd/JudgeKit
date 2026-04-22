import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { canManageContest } from "@/lib/assignments/contests";
import { rawQueryOne, rawQueryAll } from "@/lib/db/queries";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { TERMINAL_SUBMISSION_STATUSES_SQL_LIST } from "@/lib/submissions/status";

type AssignmentAccessRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
};

type ContestStatsRow = {
  participantCount: number;
  submittedCount: number;
  avgScore: number;
  problemsSolvedCount: number;
};

export const GET = createApiHandler({
  rateLimit: "leaderboard",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;
    const recruitingAccess = await getRecruitingAccessContext(user.id);

    const assignment = await rawQueryOne<AssignmentAccessRow>(
      `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode"
       FROM assignments a
       INNER JOIN groups g ON g.id = a.group_id
       WHERE a.id = @assignmentId`,
      { assignmentId }
    );

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    // Access check (same as leaderboard)
    const isInstructorView = await canManageContest(user, assignment);

    if (recruitingAccess.isRecruitingCandidate && !isInstructorView) {
      return apiError("forbidden", 403);
    }

    if (!isInstructorView) {
      const hasAccess = await rawQueryOne(
        `SELECT 1 FROM enrollments WHERE group_id = @groupId AND user_id = @userId
         UNION ALL
         SELECT 1 FROM contest_access_tokens WHERE assignment_id = @assignmentId AND user_id = @userId
         LIMIT 1`,
        { groupId: assignment.groupId, userId: user.id, assignmentId }
      );

      if (!hasAccess) {
        return apiError("forbidden", 403);
      }
    }

    // Participant count (all enrolled students)
    const participantResult = await rawQueryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM enrollments WHERE group_id = @groupId`,
      { groupId: assignment.groupId }
    );
    const participantCount = participantResult?.count ?? 0;

    // Compute stats from submissions in a single query
    const statsResult = await rawQueryOne<{
      submittedCount: number;
      avgScore: number;
    }>(
      `WITH user_best AS (
        SELECT
          s.user_id,
          s.problem_id,
          MAX(s.score) AS best_score
        FROM submissions s
        WHERE s.assignment_id = @assignmentId AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
        GROUP BY s.user_id, s.problem_id
      ),
      user_totals AS (
        SELECT
          ub.user_id,
          SUM(ub.best_score) AS total_score
        FROM user_best ub
        GROUP BY ub.user_id
      )
      SELECT
        COUNT(*)::int AS "submittedCount",
        COALESCE(ROUND(AVG(ut.total_score), 1), 0)::float AS "avgScore"
      FROM user_totals ut`,
      { assignmentId }
    );

    // Count problems that have at least one full-score submission
    const solvedResult = await rawQueryAll<{ problemId: string }>(
      `SELECT DISTINCT s.problem_id AS "problemId"
       FROM submissions s
       INNER JOIN assignment_problems ap ON ap.assignment_id = s.assignment_id AND ap.problem_id = s.problem_id
       WHERE s.assignment_id = @assignmentId
         AND s.status IN (${TERMINAL_SUBMISSION_STATUSES_SQL_LIST})
         AND ROUND(s.score, 2) >= COALESCE(ap.points, 100)`,
      { assignmentId }
    );
    const problemsSolvedCount = solvedResult.length;

    return apiSuccess({
      participantCount,
      submittedCount: statsResult?.submittedCount ?? 0,
      avgScore: statsResult?.avgScore ?? 0,
      problemsSolvedCount,
    });
  },
});

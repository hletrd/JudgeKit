import { NextRequest } from "next/server";
import { getApiUser, unauthorized, isAdmin, isInstructor } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { computeLeaderboard, getLeaderboardProblems } from "@/lib/assignments/leaderboard";
import { sqlite } from "@/lib/db";
import { logger } from "@/lib/logger";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";

type AssignmentAccessRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  anonymousLeaderboard: number | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const rl = consumeApiRateLimit(request, "leaderboard");
    if (rl) return rl;

    const { assignmentId } = await params;

    const assignment = sqlite
      .prepare<[string], AssignmentAccessRow>(
        `SELECT a.group_id AS groupId, g.instructor_id AS instructorId, a.exam_mode AS examMode, a.anonymous_leaderboard AS anonymousLeaderboard
         FROM assignments a
         INNER JOIN groups g ON g.id = a.group_id
         WHERE a.id = ?`
      )
      .get(assignmentId);

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    // Access check
    const isInstructorView =
      isAdmin(user.role) ||
      (isInstructor(user.role) && assignment.instructorId === user.id);

    if (!isInstructorView) {
      // Student: must be enrolled or have access token
      const hasAccess = sqlite
        .prepare(
          `SELECT 1 FROM enrollments WHERE group_id = ? AND user_id = ?
           UNION ALL
           SELECT 1 FROM contest_access_tokens WHERE assignment_id = ? AND user_id = ?
           LIMIT 1`
        )
        .get(assignment.groupId, user.id, assignmentId, user.id);

      if (!hasAccess) {
        return apiError("forbidden", 403);
      }
    }

    const problems = getLeaderboardProblems(assignmentId);
    const leaderboard = computeLeaderboard(assignmentId, isInstructorView);

    const isAnonymous = !isInstructorView && !!assignment.anonymousLeaderboard;

    const entries = isInstructorView
      ? leaderboard.entries
      : leaderboard.entries.map(({ userId: _userId, ...rest }) => ({
          ...rest,
          userId: "",
          isCurrentUser: _userId === user.id,
          ...(isAnonymous && {
            username: `Participant ${rest.rank}`,
            name: "",
            className: null,
          }),
        }));

    return apiSuccess({
      scoringModel: leaderboard.scoringModel,
      frozen: leaderboard.frozen,
      frozenAt: leaderboard.frozenAt,
      startsAt: leaderboard.startsAt,
      problems,
      entries,
    });
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/contests/[assignmentId]/leaderboard error");
    return apiError("leaderboardLoadFailed", 500);
  }
}

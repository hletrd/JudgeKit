import { NextRequest } from "next/server";
import { createApiHandler, isAdmin, isInstructor } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { computeLeaderboard, getLeaderboardProblems } from "@/lib/assignments/leaderboard";
import { rawQueryOne } from "@/lib/db/queries";
import { getResolvedPlatformMode } from "@/lib/system-settings";

type AssignmentAccessRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
  anonymousLeaderboard: number | null;
};

export const GET = createApiHandler({
  rateLimit: "leaderboard",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await rawQueryOne<AssignmentAccessRow>(
      `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode", a.anonymous_leaderboard AS "anonymousLeaderboard"
       FROM assignments a
       INNER JOIN groups g ON g.id = a.group_id
       WHERE a.id = @assignmentId`,
      { assignmentId }
    );

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    // Access check
    const isInstructorView =
      isAdmin(user.role) ||
      (isInstructor(user.role) && assignment.instructorId === user.id);

    if (!isInstructorView) {
      // Student: must be enrolled or have access token
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

    const problems = await getLeaderboardProblems(assignmentId);
    const leaderboard = await computeLeaderboard(assignmentId, isInstructorView);

    // Anonymize in exam mode for non-instructors, but not in recruiting mode
    const platformMode = await getResolvedPlatformMode();
    const isExamMode = assignment.examMode !== "none";
    const isAnonymous = !isInstructorView && platformMode !== "recruiting" && (!!assignment.anonymousLeaderboard || isExamMode);

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
  },
});

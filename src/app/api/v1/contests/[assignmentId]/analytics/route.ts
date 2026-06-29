import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { getContestAnalyticsCached } from "@/lib/assignments/contest-analytics-cache";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { rawQueryOne } from "@/lib/db/queries";

type AssignmentRow = {
  groupId: string;
  instructorId: string | null;
  examMode: string;
};

export const GET = createApiHandler({
  rateLimit: "analytics",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await rawQueryOne<AssignmentRow>(
      `SELECT a.group_id AS "groupId", g.instructor_id AS "instructorId", a.exam_mode AS "examMode"
       FROM assignments a INNER JOIN groups g ON g.id = a.group_id WHERE a.id = @assignmentId`,
      { assignmentId }
    );

    if (!assignment || assignment.examMode === "none") {
      return apiError("notFound", 404);
    }

    const canView = await canViewAssignmentSubmissions(assignmentId, user.id, user.role);

    if (!canView) {
      return apiError("forbidden", 403);
    }

    const analytics = await getContestAnalyticsCached(assignmentId);
    return apiSuccess(analytics);
  },
});

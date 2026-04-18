import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canViewAssignmentSubmissions } from "@/lib/assignments/submissions";
import { getParticipantTimeline } from "@/lib/assignments/participant-timeline";

export const GET = createApiHandler({
  auth: { capabilities: ["contests.view_analytics"] },
  rateLimit: "contests:participant-timeline",
  handler: async (_req: NextRequest, { user, params }) => {
    const { assignmentId, userId } = params;
    const canView = await canViewAssignmentSubmissions(assignmentId, user.id, user.role);
    if (!canView) {
      return apiError("forbidden", 403);
    }

    const timeline = await getParticipantTimeline(assignmentId, userId);
    if (!timeline) {
      return apiError("notFound", 404);
    }

    return apiSuccess(timeline);
  },
});

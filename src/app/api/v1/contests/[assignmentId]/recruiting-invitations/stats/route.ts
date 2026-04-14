import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageContest, getContestAssignment } from "@/lib/assignments/contests";
import { getInvitationStats } from "@/lib/assignments/recruiting-invitations";

export const GET = createApiHandler({
  auth: { capabilities: ["recruiting.manage_invitations"] },
  handler: async (_req: NextRequest, { user, params }) => {
    const assignment = await getContestAssignment(params.assignmentId);
    if (!assignment) return apiError("notFound", 404, "Assignment");
    if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);

    const stats = await getInvitationStats(params.assignmentId);
    return apiSuccess(stats);
  },
});

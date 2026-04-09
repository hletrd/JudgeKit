import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { redeemAccessCode } from "@/lib/assignments/access-codes";
import { redeemAccessCodeSchema } from "@/lib/validators/access-codes";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";

export const POST = createApiHandler({
  rateLimit: "contest:join",
  schema: redeemAccessCodeSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const recruitingAccess = await getRecruitingAccessContext(user.id);
    if (recruitingAccess.isRecruitingCandidate) {
      return apiError("forbidden", 403);
    }

    const ip = extractClientIp(req.headers);
    const result = await redeemAccessCode(body.code, user.id, ip ?? undefined);

    if (!result.ok) {
      return apiError(result.error, 400);
    }

    return apiSuccess({
      assignmentId: result.assignmentId,
      groupId: result.groupId,
      alreadyEnrolled: result.alreadyEnrolled ?? false,
    });
  },
});

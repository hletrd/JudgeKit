import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { extractClientIp } from "@/lib/security/ip";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { redeemAccessCode } from "@/lib/assignments/access-codes";
import { redeemAccessCodeSchema } from "@/lib/validators/access-codes";
import { getRecruitingAccessContext } from "@/lib/recruiting/access";
import { consumeUserApiRateLimit } from "@/lib/security/api-rate-limit";

function accessCodeAttemptScope(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex").slice(0, 32);
}

export const POST = createApiHandler({
  auth: true,
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
      const userFailureLimit = await consumeUserApiRateLimit(req, user.id, "contest:join:invalid");
      if (userFailureLimit) return userFailureLimit;
      const codeFailureLimit = await consumeUserApiRateLimit(
        req,
        `code:${accessCodeAttemptScope(body.code)}`,
        "contest:join:invalid-code",
      );
      if (codeFailureLimit) return codeFailureLimit;
      return apiError(result.error, 400);
    }

    return apiSuccess({
      assignmentId: result.assignmentId,
      groupId: result.groupId,
      alreadyEnrolled: result.alreadyEnrolled ?? false,
    });
  },
});

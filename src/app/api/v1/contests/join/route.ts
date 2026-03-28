import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { redeemAccessCode } from "@/lib/assignments/access-codes";
import { redeemAccessCodeSchema } from "@/lib/validators/access-codes";

export const POST = createApiHandler({
  rateLimit: "contest:join",
  schema: redeemAccessCodeSchema,
  handler: async (req: NextRequest, { user, body, params: _params }) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const result = redeemAccessCode(body.code, user.id, ip ?? undefined);

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

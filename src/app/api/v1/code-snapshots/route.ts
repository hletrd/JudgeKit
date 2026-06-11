import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { codeSnapshots } from "@/lib/db/schema";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canAccessProblem } from "@/lib/auth/permissions";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { consumeUserApiRateLimit } from "@/lib/security/api-rate-limit";
import {
  getRequiredAssignmentContextsForProblem,
  validateAssignmentSubmission,
} from "@/lib/assignments/submissions";

const snapshotSchema = z.object({
  problemId: z.string().min(1),
  assignmentId: z.string().nullable().optional(),
  language: z.string().min(1),
  sourceCode: z.string().max(256 * 1024),
});

export const POST = createApiHandler({
  auth: true,
  rateLimit: "code-snapshot",
  schema: snapshotSchema,
  handler: async (_req: NextRequest, { user, body }) => {
    // Per-user rate limit in addition to the IP-based limit above.
    // Prevents a single user from flooding the code_snapshots table.
    const userRateLimitResponse = await consumeUserApiRateLimit(_req, user.id, "code-snapshot:user");
    if (userRateLimitResponse) return userRateLimitResponse;

    // Mirror the submit/draft routes' language gate (RPF cycle-2 AGG2-1):
    // the language string is stored verbatim with no length cap, so accepting
    // arbitrary strings lets one user bloat code_snapshots and pollute the
    // anti-cheat timeline. The editor only ever sends real judge languages,
    // so this is non-breaking.
    if (!isJudgeLanguage(body.language)) {
      return apiError("languageNotSupported", 400);
    }

    let normalizedAssignmentId = body.assignmentId ?? null;

    if (!normalizedAssignmentId) {
      const assignmentContexts = await getRequiredAssignmentContextsForProblem(
        body.problemId,
        user.id,
        user.role
      );

      if (assignmentContexts.length === 1) {
        // Single context — auto-attribute the snapshot to it so the live
        // anti-cheat timeline lines up with the assignment the user is
        // actually working on. Mirrors the auto-routing in
        // src/app/api/v1/submissions/route.ts.
        normalizedAssignmentId = assignmentContexts[0].assignmentId;
      } else if (assignmentContexts.length > 1) {
        return apiError("assignmentContextRequired", 409);
      }
    }

    if (normalizedAssignmentId) {
      const assignmentValidation = await validateAssignmentSubmission(
        normalizedAssignmentId,
        body.problemId,
        user.id,
        user.role
      );

      if (!assignmentValidation.ok) {
        return apiError(assignmentValidation.error, assignmentValidation.status);
      }
    }

    const hasAccess = await canAccessProblem(body.problemId, user.id, user.role);
    if (!hasAccess) {
      return apiError("forbidden", 403);
    }

    await db.insert(codeSnapshots).values({
      userId: user.id,
      problemId: body.problemId,
      assignmentId: normalizedAssignmentId,
      language: body.language,
      sourceCode: body.sourceCode,
      charCount: body.sourceCode.length,
    });

    return apiSuccess({ ok: true }, { status: 201 });
  },
});

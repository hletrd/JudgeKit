import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { codeSnapshots } from "@/lib/db/schema";
import { createApiHandler } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canAccessProblem } from "@/lib/auth/permissions";
import {
  getStudentAssignmentContextsForProblem,
  validateAssignmentSubmission,
} from "@/lib/assignments/submissions";

const snapshotSchema = z.object({
  problemId: z.string().min(1),
  assignmentId: z.string().nullable().optional(),
  language: z.string().min(1),
  sourceCode: z.string().max(256 * 1024),
});

export const POST = createApiHandler({
  rateLimit: "code-snapshot",
  schema: snapshotSchema,
  handler: async (_req: NextRequest, { user, body }) => {
    const normalizedAssignmentId = body.assignmentId ?? null;

    if (!normalizedAssignmentId && user.role === "student") {
      const assignmentContexts = await getStudentAssignmentContextsForProblem(
        body.problemId,
        user.id
      );

      if (assignmentContexts.length > 0) {
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

import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, notFound } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { sanitizeSubmissionForViewer } from "@/lib/submissions/visibility";
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      with: {
        user: {
          columns: { name: true },
        },
        problem: {
          columns: {
            id: true,
            title: true,
            showCompileOutput: true,
            showDetailedResults: true,
            showRuntimeErrors: true,
            problemType: true,
            functionSpec: true,
          },
        },
        results: {
          with: {
            testCase: {
              columns: { sortOrder: true, isVisible: true },
            },
          },
        },
      },
    });

    if (!submission) return notFound("Submission");

    const hasAccess = await canAccessSubmission(
      { userId: submission.userId, assignmentId: submission.assignmentId },
      user.id,
      user.role,
    );

    if (!hasAccess) {
      return forbidden();
    }

    const caps = await resolveCapabilities(user.role);
    const sanitized = await sanitizeSubmissionForViewer(submission, user.id, caps);

    return apiSuccess(sanitized);
  },
});

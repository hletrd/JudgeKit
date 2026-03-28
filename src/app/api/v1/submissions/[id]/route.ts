import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, notFound } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const accessCheckSubmission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: {
        id: true,
        userId: true,
        assignmentId: true,
      },
    });

    if (!accessCheckSubmission) return notFound("Submission");

    const hasAccess = await canAccessSubmission(accessCheckSubmission, user.id, user.role);

    if (!hasAccess) {
      return forbidden();
    }

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      with: {
        user: {
          columns: { name: true },
        },
        problem: {
          columns: { id: true, title: true },
        },
        results: {
          with: {
            testCase: {
              columns: { sortOrder: true },
            },
          },
        },
      },
    });

    if (!submission) return notFound("Submission");

    const isOwner = submission.userId === user.id;
    const caps = await resolveCapabilities(user.role);
    const canViewSource = caps.has("submissions.view_source");

    if (!isOwner && !canViewSource) {
      const { sourceCode: _, ...rest } = submission;
      return apiSuccess(rest);
    }

    return apiSuccess(submission);
  },
});

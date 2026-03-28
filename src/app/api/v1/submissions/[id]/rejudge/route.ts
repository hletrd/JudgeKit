import { NextRequest } from "next/server";
import { db, sqlite } from "@/lib/db";
import { submissions, submissionResults } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, notFound, isInstructor } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/events";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { createApiHandler } from "@/lib/api/handler";

export const POST = createApiHandler({
  rateLimit: "submissions.rejudge",
  handler: async (req: NextRequest, { user, params }) => {
    if (!isInstructor(user.role)) {
      return forbidden();
    }

    const { id } = params;

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: {
        id: true,
        userId: true,
        problemId: true,
        assignmentId: true,
        status: true,
      },
    });

    if (!submission) return notFound("Submission");

    const hasAccess = await canAccessSubmission(submission, user.id, user.role);
    if (!hasAccess) return forbidden();

    // Delete existing test case results and reset submission (atomic transaction)
    sqlite.transaction(() => {
      db.delete(submissionResults).where(eq(submissionResults.submissionId, id)).run();

      db.update(submissions)
        .set({
          status: "pending",
          score: null,
          compileOutput: null,
          executionTimeMs: null,
          memoryUsedKb: null,
          judgeClaimToken: null,
          judgeClaimedAt: null,
          judgedAt: null,
        })
        .where(eq(submissions.id, id))
        .run();
    })();

    const updated = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: { sourceCode: false },
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

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.rejudged",
      resourceType: "submission",
      resourceId: id,
      resourceLabel: id,
      summary: `Rejudged submission ${id}`,
      details: {
        submissionId: id,
        problemId: submission.problemId,
        assignmentId: submission.assignmentId ?? null,
      },
      request: req,
    });

    return apiSuccess(updated);
  },
});

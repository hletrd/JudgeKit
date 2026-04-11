import { NextRequest } from "next/server";
import { db, execTransaction } from "@/lib/db";
import { submissions, submissionResults, assignments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { forbidden, notFound, isInstructor } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/events";
import { apiSuccess } from "@/lib/api/responses";
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
    await execTransaction(async (tx) => {
      await tx.delete(submissionResults).where(eq(submissionResults.submissionId, id));

      await tx.update(submissions)
        .set({
          status: "pending",
          score: null,
          compileOutput: null,
          executionTimeMs: null,
          memoryUsedKb: null,
          judgeClaimToken: null,
          judgeClaimedAt: null,
          judgeWorkerId: null,
          judgedAt: null,
        })
        .where(eq(submissions.id, id));
    });

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

    // Check if this submission belongs to a finished contest — warn in audit log
    let contestFinished = false;
    if (submission.assignmentId) {
      const assignment = await db.query.assignments.findFirst({
        where: eq(assignments.id, submission.assignmentId),
        columns: { id: true, deadline: true },
      });
      if (assignment?.deadline && new Date() > assignment.deadline) {
        contestFinished = true;
      }
    }

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.rejudged",
      resourceType: "submission",
      resourceId: id,
      resourceLabel: id,
      summary: contestFinished
        ? `Rejudged submission ${id} (WARNING: contest already finished)`
        : `Rejudged submission ${id}`,
      details: {
        submissionId: id,
        problemId: submission.problemId,
        assignmentId: submission.assignmentId ?? null,
        ...(contestFinished ? { warning: "contest_finished" } : {}),
      },
      request: req,
    });

    return apiSuccess(updated);
  },
});

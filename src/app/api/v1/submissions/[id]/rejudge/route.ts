import { NextRequest } from "next/server";
import { db, execTransaction } from "@/lib/db";
import { submissions, submissionResults, assignments, judgeWorkers } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { forbidden, notFound } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/events";
import { apiSuccess } from "@/lib/api/responses";
import { createApiHandler } from "@/lib/api/handler";
import { getDbNowUncached } from "@/lib/db-time";
import { invalidateRankingCache } from "@/lib/assignments/contest-scoring";
import { logger } from "@/lib/logger";

export const POST = createApiHandler({
  auth: { capabilities: ["submissions.rejudge"] },
  rateLimit: "submissions.rejudge",
  handler: async (req: NextRequest, { user, params }) => {
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
      // FOR UPDATE: the conditional active_tasks decrement below is decided by
      // this snapshot. Without the row lock, a poll final-report transaction
      // (which also decrements the owning worker) can commit between this read
      // and our update, and both paths decrement the same worker for the same
      // submission — under-counting its live capacity. The lock serializes the
      // two: whichever commits second sees the other's result and skips.
      const [current] = await tx
        .select({
          status: submissions.status,
          judgeWorkerId: submissions.judgeWorkerId,
        })
        .from(submissions)
        .where(eq(submissions.id, id))
        .limit(1)
        .for("update");

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

      if (
        current?.judgeWorkerId &&
        (current.status === "queued" || current.status === "judging")
      ) {
        await tx.update(judgeWorkers)
          .set({ activeTasks: sql`GREATEST(${judgeWorkers.activeTasks} - 1, 0)` })
          .where(eq(judgeWorkers.id, current.judgeWorkerId));
      }
    });

    // Invalidate leaderboard cache so instructors see updated rankings immediately.
    // Fire-and-forget: cache invalidation failure must not block the rejudge.
    if (submission.assignmentId) {
      const assignmentIdForCache = submission.assignmentId;
      Promise.resolve().then(() => {
        invalidateRankingCache(assignmentIdForCache);
      }).catch((err: unknown) => {
        logger.warn({ err, assignmentId: assignmentIdForCache }, "[rejudge] Failed to invalidate leaderboard cache");
      });
    }

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
      if (assignment?.deadline && (await getDbNowUncached()) > assignment.deadline) {
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

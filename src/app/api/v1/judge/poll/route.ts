// NOTE: This route is named "poll" for historical reasons — the original worker
// architecture polled this endpoint. The current Rust worker (judge-worker-rs)
// instead POSTs results here when judging is complete or progressing. The path
// /api/v1/judge/poll is baked into the deployed worker binary, so renaming the
// directory would break production without a coordinated redeploy.
import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, sqlite } from "@/lib/db";
import { submissions, submissionResults } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import {
  buildSubmissionResultRows,
  computeFinalJudgeMetrics,
  IN_PROGRESS_JUDGE_STATUSES,
} from "@/lib/judge/verdict";
import { isSubmissionStatus } from "@/lib/security/constants";
import { judgeStatusReportSchema } from "@/lib/validators/api";
import { triggerAutoCodeReview } from "@/lib/judge/auto-review";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeAuthorized(request)) {
      return apiError("unauthorized", 401);
    }

    const parsed = judgeStatusReportSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidJudgeResult", 400);
    }

    const { submissionId, claimToken, status, compileOutput, results } = parsed.data;

    if (!isSubmissionStatus(status)) {
      return apiError("invalidSubmissionStatus", 400);
    }

    if (results?.some((result) => !isSubmissionStatus(result.status))) {
      return apiError("invalidJudgeResult", 400);
    }

    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      columns: {
        sourceCode: false,
      },
    });

    if (!submission) {
      return apiError("submissionNotFound", 404);
    }

    if (IN_PROGRESS_JUDGE_STATUSES.has(status)) {
      const inProgressResult = db
        .update(submissions)
        .set({
          status,
          judgeClaimedAt: submission.judgeClaimedAt ?? new Date(),
        })
        .where(
          and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken))
        )
        .run();

      if (inProgressResult.changes === 0) {
        return apiError("invalidJudgeClaim", 403);
      }

      const updatedInProgress = await db.query.submissions.findFirst({
        where: eq(submissions.id, submissionId),
        columns: {
          sourceCode: false,
        },
      });

      recordAuditEvent({
        action: "submission.status_updated",
        actorRole: "system",
        resourceType: "submission",
        resourceId: submission.id,
        resourceLabel: submission.id,
        summary: `Marked submission ${submission.id} as ${status}`,
        details: {
          claimTokenPresent: true,
          previousStatus: submission.status,
          status,
        },
        request,
      });

      return apiSuccess(updatedInProgress);
    }

    const { score, maxExecutionTimeMs, maxMemoryUsedKb } = computeFinalJudgeMetrics(results);

    try {
      sqlite.transaction(() => {
        const finalResult = db.update(submissions).set({
          status,
          judgeClaimToken: null,
          judgeClaimedAt: null,
          compileOutput: compileOutput ?? null,
          score,
          executionTimeMs: maxExecutionTimeMs,
          memoryUsedKb: maxMemoryUsedKb,
          judgedAt: new Date(),
        }).where(
          and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken))
        ).run();

        if (finalResult.changes === 0) {
          throw new Error("claim_mismatch");
        }

        db.delete(submissionResults).where(eq(submissionResults.submissionId, submissionId)).run();

        const rows = buildSubmissionResultRows(submissionId, results);
        if (rows.length > 0) {
          db.insert(submissionResults).values(rows).run();
        }
      })();
    } catch (txError) {
      if (txError instanceof Error && txError.message === "claim_mismatch") {
        return apiError("invalidJudgeClaim", 403);
      }
      throw txError;
    }

    const updated = await db.query.submissions.findFirst({
      where: eq(submissions.id, submissionId),
      columns: {
        sourceCode: false,
      },
    });

    recordAuditEvent({
      action: "submission.judged",
      actorRole: "system",
      resourceType: "submission",
      resourceId: submission.id,
      resourceLabel: submission.id,
      summary: `Recorded final verdict ${status} for submission ${submission.id}`,
      details: {
        claimTokenCleared: true,
        compileOutputPresent: Boolean(compileOutput),
        previousStatus: submission.status,
        resultCount: Array.isArray(results) ? results.length : 0,
        score,
        status,
      },
      request,
    });

    // Trigger AI code review in background for accepted submissions
    if (status === "accepted") {
      void triggerAutoCodeReview(submissionId);
    }

    return apiSuccess(updated);
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/poll error");
    return apiError("internalServerError", 500);
  }
}

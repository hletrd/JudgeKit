// NOTE: This route is named "poll" for historical reasons — the original worker
// architecture polled this endpoint. The current Rust worker (judge-worker-rs)
// instead POSTs results here when judging is complete or progressing. The path
// /api/v1/judge/poll is baked into the deployed worker binary, so renaming the
// directory would break production without a coordinated redeploy.
import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, execTransaction } from "@/lib/db";
import { submissions, submissionResults, judgeWorkers } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { isJudgeAuthorized } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import {
  buildSubmissionResultRows,
  computeFinalJudgeMetrics,
  extractFinalJudgeDetail,
  IN_PROGRESS_JUDGE_STATUSES,
} from "@/lib/judge/verdict";
import { isSubmissionStatus } from "@/lib/security/constants";
import { judgeStatusReportSchema } from "@/lib/validators/api";
import { triggerAutoCodeReview } from "@/lib/judge/auto-review";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

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

    const { failedTestCaseIndex, runtimeErrorType } = extractFinalJudgeDetail(results);

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
      const updatedInProgress = await execTransaction(async (tx) => {
        const inProgressResult = await tx
          .update(submissions)
          .set({
            status,
            judgeClaimedAt: new Date(),
            failedTestCaseIndex,
            runtimeErrorType,
          })
          .where(
            and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken))
          );

        if ((inProgressResult.rowCount ?? 0) === 0) {
          throw new Error("invalidJudgeClaim");
        }

        if (Array.isArray(results) && results.length > 0) {
          await tx.delete(submissionResults).where(eq(submissionResults.submissionId, submissionId));

          const rows = buildSubmissionResultRows(submissionId, results);
          if (rows.length > 0) {
            await tx.insert(submissionResults).values(rows);
          }
        }

        return await tx.query.submissions.findFirst({
          where: eq(submissions.id, submissionId),
          columns: {
            sourceCode: false,
          },
        });
      });

      if (!updatedInProgress) {
        return apiError("invalidJudgeClaim", 403);
      }

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

    // Wrap status update + result replacement in a single transaction
    let claimValid = false;
    try {
      await db.transaction(async (tx) => {
        const finalResult = await tx.update(submissions).set({
          status,
          judgeClaimToken: null,
          judgeClaimedAt: null,
          judgeWorkerId: null,
          compileOutput: compileOutput ?? null,
          score,
          executionTimeMs: maxExecutionTimeMs,
          memoryUsedKb: maxMemoryUsedKb,
          failedTestCaseIndex,
          runtimeErrorType,
          judgedAt: new Date(),
        }).where(
          and(eq(submissions.id, submissionId), eq(submissions.judgeClaimToken, claimToken))
        );

        if ((finalResult.rowCount ?? 0) === 0) {
          throw new Error("invalidJudgeClaim");
        }

        await tx.delete(submissionResults).where(eq(submissionResults.submissionId, submissionId));

        const rows = buildSubmissionResultRows(submissionId, results);
        if (rows.length > 0) {
          await tx.insert(submissionResults).values(rows);
        }

        if (submission.judgeWorkerId) {
          await tx
            .update(judgeWorkers)
            .set({
              activeTasks: sql`GREATEST(${judgeWorkers.activeTasks} - 1, 0)`,
            })
            .where(eq(judgeWorkers.id, submission.judgeWorkerId));
        }

        claimValid = true;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "invalidJudgeClaim") {
        return apiError("invalidJudgeClaim", 403);
      }
      throw err;
    }

    if (!claimValid) {
      return apiError("invalidJudgeClaim", 403);
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

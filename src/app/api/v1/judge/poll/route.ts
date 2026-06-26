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
import { isJudgeAuthorizedForWorker } from "@/lib/judge/auth";
import { isJudgeIpAllowed } from "@/lib/judge/ip-allowlist";
import {
  buildSubmissionResultRows,
  computeFinalJudgeMetrics,
  extractFinalJudgeDetail,
  IN_PROGRESS_JUDGE_STATUSES,
  truncateJudgeDiagnostic,
} from "@/lib/judge/verdict";
import { isSubmissionStatus } from "@/lib/security/constants";
import { judgeStatusReportSchema } from "@/lib/validators/api";
import { triggerAutoCodeReview } from "@/lib/judge/auto-review";
import { logger } from "@/lib/logger";
import { getDbNowUncached } from "@/lib/db-time";
import { invalidateRankingCache } from "@/lib/assignments/contest-scoring";

export async function POST(request: NextRequest) {
  try {
    if (!isJudgeIpAllowed(request)) {
      return apiError("ipNotAllowed", 403);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("invalidJson", 400);
    }
    const parsed = judgeStatusReportSchema.safeParse(raw);

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

    // Per-worker auth is the ONLY accepted path on /poll (C4-2 Part 1). The
    // shared JUDGE_AUTH_TOKEN is bootstrap-only (/register). A submission
    // without a judgeWorkerId cannot be reported on by anyone via the shared
    // token; it will be re-claimed by a registered worker after the stale-claim
    // timeout.
    if (!submission.judgeWorkerId) {
      return apiError("unauthorized", 401);
    }
    const workerAuth = await isJudgeAuthorizedForWorker(request, submission.judgeWorkerId);
    if (!workerAuth.authorized) {
      return apiError(workerAuth.error ?? "unauthorized", 401);
    }

    if (IN_PROGRESS_JUDGE_STATUSES.has(status)) {
      const dbNow = await getDbNowUncached();
      // Mirror the final path: wrap the claim update so a stale/invalid claim
      // token yields a clean 403 instead of bubbling to the outer 500 handler.
      try {
        await execTransaction(async (tx) => {
          const inProgressResult = await tx
            .update(submissions)
            .set({
              status,
              judgeClaimedAt: dbNow,
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
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message === "invalidJudgeClaim") {
          return apiError("invalidJudgeClaim", 403);
        }
        throw err;
      }

      const updatedInProgress = await db.query.submissions.findFirst({
        where: eq(submissions.id, submissionId),
        columns: {
          sourceCode: false,
        },
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
          previousStatus: submission.status,
          status,
        },
        request,
      });

      return apiSuccess(updatedInProgress);
    }

    const { score, maxExecutionTimeMs, maxMemoryUsedKb } = computeFinalJudgeMetrics(results);

    const judgedAt = await getDbNowUncached();

    // Wrap status update + result replacement in a single transaction
    try {
      await db.transaction(async (tx) => {
        const finalResult = await tx.update(submissions).set({
          status,
          judgeClaimToken: null,
          judgeClaimedAt: null,
          judgeWorkerId: null,
          compileOutput: truncateJudgeDiagnostic(compileOutput),
          score,
          executionTimeMs: maxExecutionTimeMs,
          memoryUsedKb: maxMemoryUsedKb,
          failedTestCaseIndex,
          runtimeErrorType,
          judgedAt,
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
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "invalidJudgeClaim") {
        return apiError("invalidJudgeClaim", 403);
      }
      throw err;
    }

    // Invalidate leaderboard cache so instructors see updated rankings immediately.
    // Fire-and-forget: cache invalidation failure must not block the judge report.
    const assignmentIdForCache = submission.assignmentId;
    if (assignmentIdForCache) {
      Promise.resolve().then(() => {
        invalidateRankingCache(assignmentIdForCache);
      }).catch((err: unknown) => {
        logger.warn({ err, assignmentId: assignmentIdForCache }, "[poll] Failed to invalidate leaderboard cache");
      });
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
      Promise.resolve(triggerAutoCodeReview(submissionId)).catch((err: unknown) => {
        logger.warn({ err, submissionId }, "[auto-review] trigger failed");
      });
    }

    return apiSuccess(updated);
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/judge/poll error");
    return apiError("internalServerError", 500);
  }
}

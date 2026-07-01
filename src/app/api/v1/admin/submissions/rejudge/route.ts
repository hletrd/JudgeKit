import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { execTransaction } from "@/lib/db";
import { getSubmissionReviewGroupIds } from "@/lib/assignments/submissions";
import { assignments, judgeWorkers, submissions, submissionResults } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import { invalidateRankingCache } from "@/lib/assignments/contest-scoring";
import { logger } from "@/lib/logger";

const bulkRejudgeSchema = z.object({
  submissionIds: z.array(z.string().min(1)).min(1, "bulkRejudgeSelectionRequired").max(50, "bulkRejudgeTooMany"),
});

export const POST = createApiHandler({
  auth: {
    capabilities: ["submissions.rejudge"],
  },
  rateLimit: "submissions.bulk-rejudge",
  schema: bulkRejudgeSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const uniqueSubmissionIds = Array.from(new Set(body.submissionIds));
    const submissionReviewGroupIds = await getSubmissionReviewGroupIds(user.id, user.role);
    const scopedGroupFilter =
      submissionReviewGroupIds !== null
        ? submissionReviewGroupIds.length > 0
          ? inArray(assignments.groupId, submissionReviewGroupIds)
          : eq(assignments.id, "__no_access__")
        : undefined;

    // Run permission check and mutation inside the same transaction so the
    // permission snapshot cannot drift between check and write (TOCTOU).
    const txResult = await execTransaction(async (tx) => {
      const permittedSubmissionRows = await tx
        .select({ id: submissions.id, judgeWorkerId: submissions.judgeWorkerId })
        .from(submissions)
        .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .where(
          and(
            inArray(submissions.id, uniqueSubmissionIds),
            scopedGroupFilter
          )
        );

      if (permittedSubmissionRows.length !== uniqueSubmissionIds.length) {
        return { ok: false as const };
      }

      const workerCounts = new Map<string, number>();
      for (const row of permittedSubmissionRows) {
        if (row.judgeWorkerId) {
          workerCounts.set(
            row.judgeWorkerId,
            (workerCounts.get(row.judgeWorkerId) ?? 0) + 1,
          );
        }
      }

      await tx.delete(submissionResults).where(inArray(submissionResults.submissionId, uniqueSubmissionIds));

      await tx
        .update(submissions)
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
        .where(inArray(submissions.id, uniqueSubmissionIds));

      for (const [workerId, count] of workerCounts) {
        await tx
          .update(judgeWorkers)
          .set({
            activeTasks: sql`greatest(0, ${judgeWorkers.activeTasks} - ${count})`,
          })
          .where(eq(judgeWorkers.id, workerId));
      }

      return { ok: true as const };
    });

    if (!txResult.ok) {
      return forbidden();
    }

    // Bulk rejudge changes scores for an unknown set of assignments — clear
    // the entire leaderboard cache so no stale data persists. Admin rejudge
    // is infrequent and the cache is small (max 50 entries).
    Promise.resolve().then(() => {
      invalidateRankingCache();
    }).catch((err: unknown) => {
      logger.warn({ err }, "[rejudge] Failed to invalidate leaderboard cache");
    });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.bulk_rejudged",
      resourceType: "submission",
      resourceId: uniqueSubmissionIds[0] ?? "bulk",
      resourceLabel: `bulk:${uniqueSubmissionIds.length}`,
      summary: `Bulk rejudged ${uniqueSubmissionIds.length} submissions`,
      details: {
        submissionIds: uniqueSubmissionIds,
        rejudged: uniqueSubmissionIds.length,
      },
      request: req,
    });

    return apiSuccess({ rejudged: uniqueSubmissionIds.length });
  },
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { execTransaction } from "@/lib/db";
import { getSubmissionReviewGroupIds } from "@/lib/assignments/submissions";
import { db } from "@/lib/db";
import { assignments, submissions, submissionResults } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";

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
    const permittedSubmissionRows = await db
      .select({ id: submissions.id })
      .from(submissions)
      .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(
        and(
          inArray(submissions.id, uniqueSubmissionIds),
          scopedGroupFilter
        )
      );

    if (permittedSubmissionRows.length !== uniqueSubmissionIds.length) {
      return forbidden();
    }

    await execTransaction(async (tx) => {
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

import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { getSubmissionReviewGroupIds } from "@/lib/assignments/submissions";
import { assignments, submissions } from "@/lib/db/schema";
import { generateAndStoreReview } from "@/lib/judge/auto-review";
import { recordAuditEvent } from "@/lib/audit/events";

/**
 * POST /api/v1/admin/submissions/[id]/ai-review
 *
 * Admin manual trigger for the AI code review. Reuses the shared
 * `generateAndStoreReview` core with `requireAccepted: false` so an admin can
 * generate a review on a submission of ANY status. Dedup still applies (no
 * `force`): if an AI comment already exists the generator reports "skipped" and
 * no duplicate is created.
 *
 * Not gated by the `autoCodeReviewEnabled` toggle — that toggle governs only the
 * automatic post-accept trigger.
 */
export const POST = createApiHandler({
  auth: {
    capabilities: ["submissions.rejudge"],
  },
  rateLimit: "submissions:ai-review",
  handler: async (req: NextRequest, { user, params }) => {
    const submissionId = params.id;
    if (!submissionId) {
      return notFound("submission");
    }

    // Scope to the submissions this reviewer can see, mirroring bulk-rejudge:
    // null groupIds = super-admin (submissions.view_all) sees everything;
    // otherwise the submission's assignment must belong to a taught group.
    const submissionReviewGroupIds = await getSubmissionReviewGroupIds(user.id, user.role);
    const scopedGroupFilter =
      submissionReviewGroupIds !== null
        ? submissionReviewGroupIds.length > 0
          ? inArray(assignments.groupId, submissionReviewGroupIds)
          : eq(assignments.id, "__no_access__")
        : undefined;

    const permittedRows = await db
      .select({ id: submissions.id })
      .from(submissions)
      .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(and(eq(submissions.id, submissionId), scopedGroupFilter))
      .limit(1);

    if (permittedRows.length === 0) {
      // Either the submission does not exist or the caller may not review it.
      // Return 403 (matches bulk-rejudge's permission-failure response) rather
      // than leaking existence.
      return forbidden();
    }

    // Admin action: run on any status, dedup-guarded (no force). Await the
    // single generation so the response reflects the real outcome.
    const result = await generateAndStoreReview(submissionId, { requireAccepted: false });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.ai_review_generated",
      resourceType: "submission",
      resourceId: submissionId,
      resourceLabel: submissionId,
      summary: `Manually triggered AI review for submission ${submissionId} (${result.status})`,
      details: {
        status: result.status,
        ...(result.reason ? { reason: result.reason } : {}),
      },
      request: req,
    });

    return apiSuccess({ status: result.status, reason: result.reason });
  },
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { and, asc, count, eq, gte, inArray, isNull, lte, notExists } from "drizzle-orm";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { getSubmissionReviewGroupIds } from "@/lib/assignments/submissions";
import { assignments, submissions, submissionComments } from "@/lib/db/schema";
import { enqueueReview } from "@/lib/judge/auto-review";
import { recordAuditEvent } from "@/lib/audit/events";

/** Maximum submissions enqueued for review per backfill request. The endpoint
 *  is resumable: the UI (or an operator) calls it repeatedly and each call
 *  drains the next batch of the oldest un-reviewed accepted submissions until
 *  `remaining` reaches 0. Kept small so a single request never floods the
 *  shared review queue. */
const BACKFILL_BATCH = 10;

/** Maximum span of the `{ from, to }` window. An unbounded range would drive an
 *  expensive full-table count/scan over `submissions` on every (resumable)
 *  call, so cap the window and make the caller page through history in bounded
 *  chunks. 180 days comfortably covers a semester/term while keeping the scan
 *  cost bounded. */
const MAX_BACKFILL_WINDOW_DAYS = 180;
const MAX_BACKFILL_WINDOW_MS = MAX_BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const backfillSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.from.getTime() <= v.to.getTime(), {
    message: "invalidDateRange",
    path: ["from"],
  })
  .refine((v) => v.to.getTime() - v.from.getTime() <= MAX_BACKFILL_WINDOW_MS, {
    message: "dateRangeTooLarge",
    path: ["to"],
  });

/**
 * POST /api/v1/admin/submissions/ai-review-backfill
 *
 * Range-scoped bulk backfill of AI reviews. Targets ACCEPTED submissions in the
 * `{ from, to }` window that LACK an AI comment (dedup predicate: no
 * `submission_comments` row with `authorId IS NULL`), scoped to the reviewer's
 * groups like bulk-rejudge.
 *
 * Not gated by the `autoCodeReviewEnabled` toggle — this is an explicit admin
 * action. Resumable + bounded: counts total matching (`remaining`) and enqueues
 * up to BACKFILL_BATCH of the oldest matches through the shared review queue
 * (fire-and-forget, respecting the pLimit(2) + queue-cap guards). Because
 * generation is dedup-safe, repeated calls drain the rest.
 */
export const POST = createApiHandler({
  auth: {
    capabilities: ["submissions.rejudge"],
  },
  rateLimit: "submissions:ai-review-backfill",
  schema: backfillSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const { from, to } = body;

    // Scope like bulk-rejudge: null = super-admin (view_all) sees everything;
    // otherwise only submissions whose assignment belongs to a taught group.
    const submissionReviewGroupIds = await getSubmissionReviewGroupIds(user.id, user.role);
    const scopedGroupFilter =
      submissionReviewGroupIds !== null
        ? submissionReviewGroupIds.length > 0
          ? inArray(assignments.groupId, submissionReviewGroupIds)
          : eq(assignments.id, "__no_access__")
        : undefined;

    // "Lacks an AI comment" — the same dedup predicate the generator enforces.
    const lacksAiComment = notExists(
      db
        .select({ one: submissionComments.id })
        .from(submissionComments)
        .where(
          and(
            eq(submissionComments.submissionId, submissions.id),
            isNull(submissionComments.authorId),
          ),
        ),
    );

    const matchFilter = and(
      eq(submissions.status, "accepted"),
      gte(submissions.submittedAt, from),
      lte(submissions.submittedAt, to),
      scopedGroupFilter,
      lacksAiComment,
    );

    // Total backlog before this batch drains. The UI loops until this hits 0.
    const countRows = await db
      .select({ total: count() })
      .from(submissions)
      .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(matchFilter);
    const remaining = Number(countRows[0]?.total ?? 0);

    // Oldest-first so the backlog drains deterministically across calls.
    const candidateRows = remaining > 0
      ? await db
          .select({ id: submissions.id })
          .from(submissions)
          .leftJoin(assignments, eq(submissions.assignmentId, assignments.id))
          .where(matchFilter)
          .orderBy(asc(submissions.submittedAt))
          .limit(BACKFILL_BATCH)
      : [];

    // Fire-and-forget through the shared bounded queue. Stop as soon as the
    // queue is full so the caller can back off (enqueueReview returns false).
    let enqueued = 0;
    for (const row of candidateRows) {
      if (!enqueueReview(row.id, { requireAccepted: true })) break;
      enqueued += 1;
    }

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.ai_review_backfilled",
      resourceType: "submission",
      resourceId: "bulk",
      resourceLabel: `backfill:${enqueued}`,
      summary: `Enqueued ${enqueued} AI review(s) via backfill (${remaining} matching)`,
      details: {
        from: from.toISOString(),
        to: to.toISOString(),
        enqueued,
        remaining,
      },
      request: req,
    });

    return apiSuccess({ enqueued, remaining });
  },
});

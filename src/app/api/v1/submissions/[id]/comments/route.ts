import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { submissions, submissionComments } from "@/lib/db/schema";
import { forbidden, notFound, isInstructor } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { commentCreateSchema } from "@/lib/validators/comments";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { createApiHandler } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    if (!id) return notFound("Submission");
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: {
        id: true,
        userId: true,
        assignmentId: true,
      },
    });

    if (!submission) return notFound("Submission");

    const hasAccess = await canAccessSubmission(submission, user.id, user.role);
    if (!hasAccess) return forbidden();

    const comments = await db.query.submissionComments.findMany({
      where: eq(submissionComments.submissionId, id),
      with: {
        author: {
          columns: { name: true, role: true },
        },
      },
      orderBy: (sc, { asc }) => [asc(sc.createdAt)],
    });

    return apiSuccess(comments);
  },
});

export const POST = createApiHandler({
  rateLimit: "comments:add",
  schema: commentCreateSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    if (!isInstructor(user.role)) return forbidden();

    const { id } = params;
    if (!id) return notFound("Submission");
    const submission = await db.query.submissions.findFirst({
      where: eq(submissions.id, id),
      columns: {
        id: true,
        userId: true,
        assignmentId: true,
      },
    });

    if (!submission) return notFound("Submission");

    const hasAccess = await canAccessSubmission(submission, user.id, user.role);
    if (!hasAccess) return forbidden();

    const [created] = await db
      .insert(submissionComments)
      .values({
        submissionId: id,
        authorId: user.id,
        content: sanitizeHtml(body.content),
      })
      .returning();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "submission.comment_added",
      resourceType: "submission",
      resourceId: id,
      resourceLabel: id,
      summary: `Added feedback comment on submission ${id}`,
      details: {
        submissionId: id,
        commentId: created.id,
      },
      request: req,
    });

    const comment = await db.query.submissionComments.findFirst({
      where: eq(submissionComments.id, created.id),
      with: {
        author: {
          columns: { name: true, role: true },
        },
      },
    });

    return apiSuccess(comment, { status: 201 });
  },
});

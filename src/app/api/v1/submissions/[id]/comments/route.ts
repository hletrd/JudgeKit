import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { submissions, submissionComments } from "@/lib/db/schema";
import { getApiUser, unauthorized, forbidden, notFound, csrfForbidden, isInstructor } from "@/lib/api/auth";
import { canAccessSubmission } from "@/lib/auth/permissions";
import { commentCreateSchema } from "@/lib/validators/comments";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { sanitizeHtml } from "@/lib/security/sanitize-html";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const id = (await params).id;
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
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/submissions/[id]/comments error");
    return apiError("internalServerError", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = consumeApiRateLimit(request, "comments:add");
    if (rateLimitResponse) return rateLimitResponse;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    if (!isInstructor(user.role)) return forbidden();

    const id = (await params).id;
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

    const body = await request.json();
    const parsed = commentCreateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidComment", 400);
    }

    const [created] = await db
      .insert(submissionComments)
      .values({
        submissionId: id,
        authorId: user.id,
        content: sanitizeHtml(parsed.data.content),
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
      request,
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
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/submissions/[id]/comments error");
    return apiError("internalServerError", 500);
  }
}

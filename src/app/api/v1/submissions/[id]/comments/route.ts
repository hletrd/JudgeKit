import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { submissions, submissionComments } from "@/lib/db/schema";
import { forbidden, notFound } from "@/lib/api/auth";
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

    // Submitter-side view: when the requester is the submitter and not
    // a staff role (instructor/admin/super_admin/assistant), strip
    // reviewer name and role. The candidate review (cycle 2026-05-21,
    // 05-candidate.md §5.5) flagged this as a recruiter identity leak —
    // an HR-side reviewer's name on a comment is metadata the candidate
    // is not supposed to learn until/unless the employer chooses to
    // share it. Staff viewers continue to see reviewer identity, which
    // is required for the dashboard workflow.
    const STAFF_ROLES = new Set(["instructor", "admin", "super_admin", "assistant"]);
    const isSubmitter = submission.userId === user.id;
    const isStaff = STAFF_ROLES.has(user.role);
    const maskedComments = (isSubmitter && !isStaff)
      ? comments.map((c) => ({ ...c, author: c.author ? { name: null, role: null } : null }))
      : comments;

    return apiSuccess(maskedComments);
  },
});

export const POST = createApiHandler({
  auth: { capabilities: ["submissions.comment"] },
  rateLimit: "comments:add",
  schema: commentCreateSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
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
        lineNumber: body.lineNumber ?? null,
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

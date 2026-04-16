import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { discussionThreads } from "@/lib/db/schema";
import { discussionThreadCreateSchema } from "@/lib/validators/discussions";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { canAccessProblem } from "@/lib/auth/permissions";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";
import { recordAuditEvent } from "@/lib/audit/events";

export const POST = createApiHandler({
  auth: true,
  rateLimit: "community:threads:create",
  schema: discussionThreadCreateSchema,
  handler: async (req: NextRequest, { user, body }) => {
    if (body.scopeType === "problem" || body.scopeType === "editorial") {
      const problem = await db.query.problems.findFirst({
        where: (table, { eq }) => eq(table.id, body.problemId!),
        columns: { id: true },
      });
      if (!problem) {
        return apiError("problemNotFound", 404);
      }

      const hasAccess = await canAccessProblem(problem.id, user.id, user.role);
      if (!hasAccess) {
        return forbidden();
      }
    }

    if (
      body.scopeType === "editorial" &&
      !["admin", "super_admin", "instructor"].includes(user.role)
    ) {
      return forbidden();
    }

    const [created] = await db.insert(discussionThreads).values({
      scopeType: body.scopeType,
      problemId: body.scopeType === "problem" || body.scopeType === "editorial" ? body.problemId ?? null : null,
      authorId: user.id,
      title: body.title,
      content: sanitizeMarkdown(body.content),
    }).returning();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "discussion.thread_created",
      resourceType: "discussion_thread",
      resourceId: created.id,
      resourceLabel: created.title,
      summary: `Created discussion thread \"${created.title}\"`,
      details: {
        scopeType: created.scopeType,
        problemId: created.problemId,
      },
      request: req,
    });

    return apiSuccess(created, { status: 201 });
  },
});

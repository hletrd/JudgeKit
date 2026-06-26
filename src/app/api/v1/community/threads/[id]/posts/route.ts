import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { discussionPosts, discussionThreads } from "@/lib/db/schema";
import { discussionPostCreateSchema } from "@/lib/validators/discussions";
import { canAccessProblemScopedThread } from "@/lib/discussions/permissions";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";

export const POST = createApiHandler({
  auth: true,
  rateLimit: "community:posts:create",
  schema: discussionPostCreateSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const { id } = params;
    const thread = await db.query.discussionThreads.findFirst({
      where: eq(discussionThreads.id, id),
      columns: {
        id: true,
        title: true,
        scopeType: true,
        problemId: true,
        lockedAt: true,
      },
    });

    if (!thread) {
      return notFound("Discussion thread");
    }

    if (thread.lockedAt) {
      return apiError("discussionThreadLocked", 409);
    }

    // Problem-linked scopes (problem/editorial/solution) require problem
    // access before a user may reply. Centralized in discussions/permissions.
    if (
      !(await canAccessProblemScopedThread(thread.scopeType, thread.problemId, {
        userId: user.id,
        role: user.role,
      }))
    ) {
      return forbidden();
    }

    const [created] = await db.transaction(async (tx) => {
      const [post] = await tx.insert(discussionPosts).values({
        threadId: thread.id,
        authorId: user.id,
        content: sanitizeMarkdown(body.content),
      }).returning();

      await tx.update(discussionThreads)
        .set({ updatedAt: await getDbNowUncached() })
        .where(eq(discussionThreads.id, thread.id));

      return [post];
    });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "discussion.reply_created",
      resourceType: "discussion_thread",
      resourceId: thread.id,
      resourceLabel: thread.title,
      summary: `Replied to discussion thread \"${thread.title}\"`,
      details: {
        threadId: thread.id,
        postId: created.id,
      },
      request: req,
    });

    return apiSuccess(created, { status: 201 });
  },
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { discussionThreads } from "@/lib/db/schema";
import { canModerateDiscussions } from "@/lib/discussions/permissions";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";

const discussionThreadModerationSchema = z
  .object({
    locked: z.boolean().optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => value.locked !== undefined || value.pinned !== undefined, {
    message: "discussionModerationNoop",
  });

export const PATCH = createApiHandler({
  auth: true,
  rateLimit: "community:threads:moderate",
  schema: discussionThreadModerationSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    if (!(await canModerateDiscussions(user.role))) {
      return forbidden();
    }

    const { id } = params;
    const thread = await db.query.discussionThreads.findFirst({
      where: eq(discussionThreads.id, id),
      columns: { id: true, title: true, lockedAt: true, pinnedAt: true },
    });

    if (!thread) {
      return notFound("Discussion thread");
    }

    const now = await getDbNowUncached();
    const [updated] = await db.update(discussionThreads)
      .set({
        lockedAt: body.locked === undefined ? thread.lockedAt : body.locked ? now : null,
        pinnedAt: body.pinned === undefined ? thread.pinnedAt : body.pinned ? now : null,
        updatedAt: now,
      })
      .where(eq(discussionThreads.id, id))
      .returning();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "discussion.thread_moderated",
      resourceType: "discussion_thread",
      resourceId: id,
      resourceLabel: thread.title,
      summary: `Updated moderation state for discussion thread \"${thread.title}\"`,
      details: {
        locked: Boolean(updated.lockedAt),
        pinned: Boolean(updated.pinnedAt),
      },
      request: req,
    });

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  auth: true,
  rateLimit: "community:threads:delete",
  handler: async (req: NextRequest, { user, params }) => {
    if (!(await canModerateDiscussions(user.role))) {
      return forbidden();
    }

    const { id } = params;
    const thread = await db.query.discussionThreads.findFirst({
      where: eq(discussionThreads.id, id),
      columns: { id: true, title: true },
    });

    if (!thread) {
      return notFound("Discussion thread");
    }

    await db.delete(discussionThreads).where(eq(discussionThreads.id, id));

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "discussion.thread_deleted",
      resourceType: "discussion_thread",
      resourceId: id,
      resourceLabel: thread.title,
      summary: `Deleted discussion thread \"${thread.title}\"`,
      request: req,
    });

    return apiSuccess({ id });
  },
});

import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { canAccessProblem } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { communityVotes, discussionPosts, discussionThreads } from "@/lib/db/schema";
import { communityVoteSchema } from "@/lib/validators/discussions";

export const POST = createApiHandler({
  auth: true,
  rateLimit: "community:votes",
  schema: communityVoteSchema,
  handler: async (_req: NextRequest, { user, body }) => {
    const target =
      body.targetType === "thread"
        ? await db.query.discussionThreads.findFirst({
            where: eq(discussionThreads.id, body.targetId),
            columns: {
              id: true,
              authorId: true,
              scopeType: true,
              problemId: true,
            },
          })
        : await db.query.discussionPosts.findFirst({
            where: eq(discussionPosts.id, body.targetId),
            columns: {
              id: true,
              authorId: true,
            },
            with: {
              thread: {
                columns: {
                  id: true,
                  scopeType: true,
                  problemId: true,
                },
              },
            },
          });

    if (!target) {
      return notFound(body.targetType === "thread" ? "Discussion thread" : "Discussion post");
    }

    const problemId =
      body.targetType === "thread"
        ? target && "scopeType" in target && (target.scopeType === "problem" || target.scopeType === "editorial")
          ? target.problemId
          : null
        : target && "thread" in target && (target.thread?.scopeType === "problem" || target.thread?.scopeType === "editorial")
          ? target.thread?.problemId ?? null
          : null;

    if (problemId) {
      const hasAccess = await canAccessProblem(problemId, user.id, user.role);
      if (!hasAccess) {
        return forbidden();
      }
    }

    if (target.authorId && target.authorId === user.id) {
      return apiSuccess({
        targetType: body.targetType,
        targetId: body.targetId,
        score: 0,
        currentUserVote: null,
      }, { status: 409 });
    }

    const existing = await db.query.communityVotes.findFirst({
      where: and(
        eq(communityVotes.targetType, body.targetType),
        eq(communityVotes.targetId, body.targetId),
        eq(communityVotes.userId, user.id),
      ),
    });

    if (existing?.voteType === body.voteType) {
      await db.delete(communityVotes).where(eq(communityVotes.id, existing.id));
    } else if (existing) {
      await db
        .update(communityVotes)
        .set({
          voteType: body.voteType,
          updatedAt: new Date(),
        })
        .where(eq(communityVotes.id, existing.id));
    } else {
      await db.insert(communityVotes).values({
        targetType: body.targetType,
        targetId: body.targetId,
        userId: user.id,
        voteType: body.voteType,
      });
    }

    const [summary] = await db
      .select({
        score: sql<number>`coalesce(sum(case when ${communityVotes.voteType} = 'up' then 1 when ${communityVotes.voteType} = 'down' then -1 else 0 end), 0)`,
        currentUserVote: sql<"up" | "down" | null>`max(case when ${communityVotes.userId} = ${user.id} then ${communityVotes.voteType} else null end)`,
      })
      .from(communityVotes)
      .where(
        and(
          eq(communityVotes.targetType, body.targetType),
          eq(communityVotes.targetId, body.targetId),
        ),
      );

    return apiSuccess({
      targetType: body.targetType,
      targetId: body.targetId,
      score: Number(summary?.score ?? 0),
      currentUserVote: summary?.currentUserVote ?? null,
    });
  },
});

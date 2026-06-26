import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canAccessProblemScopedThread } from "@/lib/discussions/permissions";
import { db } from "@/lib/db";
import { communityVotes, discussionPosts, discussionThreads } from "@/lib/db/schema";
import { communityVoteSchema } from "@/lib/validators/discussions";
import { getDbNowUncached } from "@/lib/db-time";
import { getSystemSettings } from "@/lib/system-settings";

export const POST = createApiHandler({
  auth: true,
  rateLimit: "community:votes",
  schema: communityVoteSchema,
  handler: async (_req: NextRequest, { user, body }) => {
    // Operator can dial down voting per direction without disabling the
    // community board itself. Defaults stay true so a deployment that
    // never touches this setting keeps the legacy behavior.
    const settings = await getSystemSettings();
    const upvoteEnabled = settings?.communityUpvoteEnabled !== false;
    const downvoteEnabled = settings?.communityDownvoteEnabled !== false;
    if (body.voteType === "up" && !upvoteEnabled) {
      return apiError("upvoteDisabled", 403);
    }
    if (body.voteType === "down" && !downvoteEnabled) {
      return apiError("downvoteDisabled", 403);
    }
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

    // Route the problem-linked scope check through the single helper so the
    // scope set stays centralized (PROBLEM_LINKED_SCOPES). Inline duplication
    // previously let editorial/solution scopes drift past some call sites
    // (C2-H5 / SEC-9). See C3-AGG-4.
    const scopeType =
      body.targetType === "thread"
        ? target && "scopeType" in target
          ? target.scopeType
          : null
        : target && "thread" in target
          ? target.thread?.scopeType
          : null;
    const problemId =
      body.targetType === "thread"
        ? target && "scopeType" in target
          ? target.problemId
          : null
        : target && "thread" in target
          ? (target.thread?.problemId ?? null)
          : null;

    if (
      !(await canAccessProblemScopedThread(scopeType, problemId, {
        userId: user.id,
        role: user.role,
      }))
    ) {
      return forbidden();
    }

    if (target.authorId && target.authorId === user.id) {
      return apiSuccess({
        targetType: body.targetType,
        targetId: body.targetId,
        score: 0,
        currentUserVote: null,
      }, { status: 409 });
    }

    // Atomic vote toggle inside a transaction to prevent TOCTOU races on
    // concurrent requests. The unique index (target_type, target_id, user_id)
    // guarantees at most one vote row per user per target.
    // - Same vote type → delete (toggle off)
    // - Different vote type → update (change vote)
    // - No existing vote → insert (new vote)
    const now = await getDbNowUncached();
    const [summary] = await db.transaction(async (tx) => {
      const existing = await tx.query.communityVotes.findFirst({
        where: and(
          eq(communityVotes.targetType, body.targetType),
          eq(communityVotes.targetId, body.targetId),
          eq(communityVotes.userId, user.id),
        ),
        columns: { id: true, voteType: true },
      });

      if (existing?.voteType === body.voteType) {
        await tx.delete(communityVotes).where(eq(communityVotes.id, existing.id));
      } else if (existing) {
        await tx
          .update(communityVotes)
          .set({
            voteType: body.voteType,
            updatedAt: now,
          })
          .where(eq(communityVotes.id, existing.id));
      } else {
        await tx.insert(communityVotes).values({
          targetType: body.targetType,
          targetId: body.targetId,
          userId: user.id,
          voteType: body.voteType,
        }).onConflictDoUpdate({
          target: [communityVotes.targetType, communityVotes.targetId, communityVotes.userId],
          set: { voteType: body.voteType, updatedAt: now },
        });
      }

      // Score summary runs inside the same transaction for consistent read.
      // Under READ COMMITTED isolation, the returned score includes concurrent
      // votes from other committed transactions — this is the desired behavior
      // (users see the most up-to-date vote count).
      return tx
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
    });

    return apiSuccess({
      targetType: body.targetType,
      targetId: body.targetId,
      score: Number(summary?.score ?? 0),
      currentUserVote: summary?.currentUserVote ?? null,
    });
  },
});

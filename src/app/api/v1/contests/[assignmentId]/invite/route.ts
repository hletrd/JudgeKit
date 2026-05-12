import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { getContestAssignment, canManageContest } from "@/lib/assignments/contests";
import { db, execTransaction } from "@/lib/db";
import { users, enrollments, contestAccessTokens } from "@/lib/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { escapeLikePattern } from "@/lib/db/like";
import { getDbNowUncached } from "@/lib/db-time";


const inviteSchema = z.object({
  username: z.string().min(1).max(255),
});

/**
 * GET - Search users to invite (autocomplete)
 */
export const GET = createApiHandler({
  rateLimit: "contest:invite-search",
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await getContestAssignment(assignmentId);
    if (!assignment || assignment.examMode === "none") return apiError("notFound", 404);
    if (!(await canManageContest(user, assignment))) return apiError("forbidden", 403);

    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!query) return apiSuccess([]);

    // Escape LIKE wildcards in user input
    const likePattern = `%${escapeLikePattern(query)}%`;
    const results = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        className: users.className,
      })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          or(
            sql`${users.username} ILIKE ${likePattern} ESCAPE '\\'`,
            sql`${users.name} ILIKE ${likePattern} ESCAPE '\\'`
          )
        )
      )
      .limit(10);

    // Batch enrollment check (avoids N+1 query pattern)
    const userIds = results.map((u) => u.id);
    const enrolledRows = userIds.length > 0
      ? await db
          .select({ userId: enrollments.userId })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.groupId, assignment.groupId),
              inArray(enrollments.userId, userIds)
            )
          )
      : [];
    const enrolledSet = new Set(enrolledRows.map((r) => r.userId));

    const enriched = results.map((u) => ({
      ...u,
      alreadyEnrolled: enrolledSet.has(u.id),
    }));

    return apiSuccess(enriched);
  },
});

/**
 * POST - Invite a user to the contest by username
 */
export const POST = createApiHandler({
  schema: inviteSchema,
  handler: async (req: NextRequest, { user: apiUser, body, params }) => {
    const { assignmentId } = params;

    const assignment = await getContestAssignment(assignmentId);
    if (!assignment || assignment.examMode === "none") return apiError("notFound", 404);
    if (!(await canManageContest(apiUser, assignment))) return apiError("forbidden", 403);

    const targetUser = await db.query.users.findFirst({
      where: eq(users.username, body.username),
      columns: { id: true, username: true, name: true },
    });

    if (!targetUser) return apiError("userNotFound", 404);

    // Use DB server time for stored timestamps to avoid clock skew between
    // app server and DB server, consistent with access code redemption.
    const now = await getDbNowUncached();

    // Atomically upsert contest access token + enrollment inside a transaction.
    // onConflictDoNothing handles the race condition — no need for a preceding SELECT.
    await execTransaction(async (tx) => {
      await tx.insert(contestAccessTokens)
        .values({
          id: nanoid(),
          assignmentId,
          userId: targetUser.id,
          redeemedAt: now,
          ipAddress: null,
          expiresAt: assignment.deadline,
        })
        .onConflictDoNothing({
          target: [contestAccessTokens.assignmentId, contestAccessTokens.userId],
        });

      await tx.insert(enrollments)
        .values({
          id: nanoid(),
          userId: targetUser.id,
          groupId: assignment.groupId,
          enrolledAt: now,
        })
        .onConflictDoNothing({
          target: [enrollments.userId, enrollments.groupId],
        });
    });
    return apiSuccess({
      userId: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
    });
  },
});

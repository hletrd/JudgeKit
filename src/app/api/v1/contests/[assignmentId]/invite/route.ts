import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { getContestAssignment, canManageContest } from "@/lib/assignments/contests";
import { db, execTransaction } from "@/lib/db";
import { users, enrollments, contestAccessTokens } from "@/lib/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";


const inviteSchema = z.object({
  username: z.string().min(1).max(255),
});

/**
 * GET - Search users to invite (autocomplete)
 */
export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { assignmentId } = params;

    const assignment = await getContestAssignment(assignmentId);
    if (!assignment || assignment.examMode === "none") return apiError("notFound", 404);
    if (!canManageContest(user, assignment)) return apiError("forbidden", 403);

    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!query) return apiSuccess([]);

    // Escape LIKE wildcards in user input
    const escaped = query.toLowerCase().replace(/[%_]/g, "\\$&");
    const likePattern = `%${escaped}%`;
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
            sql`lower(${users.username}) like ${likePattern} escape '\\'`,
            sql`lower(${users.name}) like ${likePattern} escape '\\'`
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
    if (!canManageContest(apiUser, assignment)) return apiError("forbidden", 403);

    const targetUser = await db.query.users.findFirst({
      where: eq(users.username, body.username),
      columns: { id: true, username: true, name: true },
    });

    if (!targetUser) return apiError("userNotFound", 404);

    // Atomically upsert contest access token + enrollment inside a transaction
    await execTransaction(async (tx) => {
      // Upsert contest access token
      const [existingToken] = await tx
        .select({ id: contestAccessTokens.id })
        .from(contestAccessTokens)
        .where(
          and(
            eq(contestAccessTokens.assignmentId, assignmentId),
            eq(contestAccessTokens.userId, targetUser.id)
          )
        );

      if (!existingToken) {
        await tx.insert(contestAccessTokens)
          .values({
            id: nanoid(),
            assignmentId,
            userId: targetUser.id,
            redeemedAt: new Date(),
            ipAddress: null,
          })
          .onConflictDoNothing({
            target: [contestAccessTokens.assignmentId, contestAccessTokens.userId],
          });
      }

      // Upsert enrollment
      const [existingEnrollment] = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.groupId, assignment.groupId),
            eq(enrollments.userId, targetUser.id)
          )
        );

      if (!existingEnrollment) {
        await tx.insert(enrollments)
          .values({
            id: nanoid(),
            userId: targetUser.id,
            groupId: assignment.groupId,
            enrolledAt: new Date(),
          })
          .onConflictDoNothing({
            target: [enrollments.userId, enrollments.groupId],
          });
      }
    });
    return apiSuccess({
      userId: targetUser.id,
      username: targetUser.username,
      name: targetUser.name,
    });
  },
});

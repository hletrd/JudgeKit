import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assignmentProblems, assignments, enrollments, scoreOverrides } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import type { AuthUser } from "@/lib/api/handler";
import { getDbNowUncached } from "@/lib/db-time";

const scoreOverrideBodySchema = z.object({
  problemId: z.string().min(1),
  userId: z.string().min(1),
  overrideScore: z.number().min(0).max(10000),
  reason: z.string().max(1000).optional(),
});

const deleteOverrideQuerySchema = z.object({
  problemId: z.string().min(1),
  userId: z.string().min(1),
});

type AssignmentAuthSuccess = {
  assignment: { id: string; groupId: string | null; title: string };
  groupId: string;
};

async function authorizeAssignmentAccess(
  user: AuthUser,
  params: Record<string, string>,
): Promise<AssignmentAuthSuccess | { error: NextResponse }> {
  const id = params.id;
  const assignmentId = params.assignmentId;
  if (!id || !assignmentId) {
    return { error: notFound("Assignment") };
  }

  const group = await db.query.groups.findFirst({
    where: (groups, { eq: equals }) => equals(groups.id, id),
    columns: { id: true, instructorId: true },
  });
  if (!group) return { error: notFound("Group") };

  const canManage = await canManageGroupResourcesAsync(
    group.instructorId,
    user.id,
    user.role,
    id,
  );
  if (!canManage) return { error: forbidden() };

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: { id: true, groupId: true, title: true },
  });
  if (!assignment || assignment.groupId !== id) {
    return { error: notFound("Assignment") };
  }

  return { assignment, groupId: id };
}

export const POST = createApiHandler({
  rateLimit: "overrides:upsert",
  schema: scoreOverrideBodySchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const access = await authorizeAssignmentAccess(user, params);
    if ("error" in access) return access.error;

    const { assignment, groupId } = access;
    const { problemId, userId, overrideScore, reason } = body;

    const assignmentProblem = await db.query.assignmentProblems.findFirst({
      where: and(
        eq(assignmentProblems.assignmentId, assignment.id),
        eq(assignmentProblems.problemId, problemId),
      ),
      columns: { id: true, points: true },
    });
    if (!assignmentProblem) {
      return apiError("problemNotInAssignment", 400);
    }

    const maxPoints = assignmentProblem.points ?? 100;
    if (overrideScore > maxPoints) {
      return apiError("overrideScoreExceedsMax", 400);
    }

    const targetEnrollment = await db.query.enrollments.findFirst({
      where: and(eq(enrollments.groupId, groupId), eq(enrollments.userId, userId)),
      columns: { id: true },
    });
    if (!targetEnrollment) {
      return apiError("userNotEnrolled", 400);
    }

    await db.transaction(async (tx) => {
      await tx.delete(scoreOverrides)
        .where(
          and(
            eq(scoreOverrides.assignmentId, assignment.id),
            eq(scoreOverrides.problemId, problemId),
            eq(scoreOverrides.userId, userId),
          ),
        );

      await tx.insert(scoreOverrides)
        .values({
          assignmentId: assignment.id,
          problemId,
          userId,
          overrideScore,
          reason: reason ?? null,
          createdBy: user.id,
          createdAt: await getDbNowUncached(),
        });
    });

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "score_override.upserted",
      resourceType: "score_override",
      resourceId: assignment.id,
      resourceLabel: assignment.title,
      summary: `Set score override to ${overrideScore} for user ${userId} on problem ${problemId}`,
      details: {
        assignmentId: assignment.id,
        problemId,
        userId,
        overrideScore,
        reason: reason ?? null,
      },
      request: req,
    });

    return apiSuccess({ assignmentId: assignment.id, problemId, userId, overrideScore, reason });
  },
});

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const access = await authorizeAssignmentAccess(user, params);
    if ("error" in access) return access.error;

    const overrides = await db
      .select({
        id: scoreOverrides.id,
        assignmentId: scoreOverrides.assignmentId,
        problemId: scoreOverrides.problemId,
        userId: scoreOverrides.userId,
        overrideScore: scoreOverrides.overrideScore,
        reason: scoreOverrides.reason,
        createdBy: scoreOverrides.createdBy,
        createdAt: scoreOverrides.createdAt,
      })
      .from(scoreOverrides)
      .where(eq(scoreOverrides.assignmentId, access.assignment.id));
    return apiSuccess(overrides);
  },
});

export const DELETE = createApiHandler({
  rateLimit: "overrides:delete",
  handler: async (req: NextRequest, { user, params }) => {
    const access = await authorizeAssignmentAccess(user, params);
    if ("error" in access) return access.error;

    const { assignment } = access;
    const { searchParams } = new URL(req.url);
    const queryParsed = deleteOverrideQuerySchema.safeParse({
      problemId: searchParams.get("problemId") ?? "",
      userId: searchParams.get("userId") ?? "",
    });
    if (!queryParsed.success) {
      return apiError(queryParsed.error.issues[0]?.message ?? "invalidInput", 400);
    }

    const { problemId, userId } = queryParsed.data;
    const [existing] = await db
      .select({ assignmentId: scoreOverrides.assignmentId })
      .from(scoreOverrides)
      .where(
        and(
          eq(scoreOverrides.assignmentId, assignment.id),
          eq(scoreOverrides.problemId, problemId),
          eq(scoreOverrides.userId, userId),
        ),
      );

    if (!existing) {
      return notFound("ScoreOverride");
    }

    await db
      .delete(scoreOverrides)
      .where(
        and(
          eq(scoreOverrides.assignmentId, assignment.id),
          eq(scoreOverrides.problemId, problemId),
          eq(scoreOverrides.userId, userId),
        ),
      );

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "score_override.deleted",
      resourceType: "score_override",
      resourceId: assignment.id,
      resourceLabel: assignment.title,
      summary: `Removed score override for user ${userId} on problem ${problemId}`,
      details: {
        assignmentId: assignment.id,
        problemId,
        userId,
      },
      request: req,
    });

    return apiSuccess({ assignmentId: assignment.id, problemId, userId });
  },
});

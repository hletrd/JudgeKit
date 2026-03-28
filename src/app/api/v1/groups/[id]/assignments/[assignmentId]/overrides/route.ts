import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sqlite } from "@/lib/db";
import { assignmentProblems, assignments, enrollments, scoreOverrides } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { getApiUser, forbidden, notFound, unauthorized, csrfForbidden } from "@/lib/api/auth";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";

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

async function resolveAssignmentAndAuthorize(
  request: NextRequest,
  params: Promise<Record<string, string>>
) {
  const user = await getApiUser(request);
  if (!user) return { error: unauthorized() };

  const { id, assignmentId } = await params;
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
    user.role
  );

  if (!canManage) return { error: forbidden() };

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: { id: true, groupId: true, title: true },
  });

  if (!assignment || assignment.groupId !== id) {
    return { error: notFound("Assignment") };
  }

  return { user, assignment, groupId: id };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = consumeApiRateLimit(request, "overrides:upsert");
    if (rateLimitResponse) return rateLimitResponse;

    const result = await resolveAssignmentAndAuthorize(request, params);
    if ("error" in result) return result.error;

    const { user, assignment } = result;

    const body = await request.json();
    const parsed = scoreOverrideBodySchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "invalidInput", 400);
    }

    const { problemId, userId, overrideScore, reason } = parsed.data;

    // Verify problemId belongs to this assignment
    const assignmentProblem = await db.query.assignmentProblems.findFirst({
      where: and(
        eq(assignmentProblems.assignmentId, assignment.id),
        eq(assignmentProblems.problemId, problemId)
      ),
      columns: { id: true, points: true },
    });
    if (!assignmentProblem) {
      return apiError("problemNotInAssignment", 400);
    }

    // Cap override score to the problem's max points
    const maxPoints = assignmentProblem.points ?? 100;
    if (overrideScore > maxPoints) {
      return apiError("overrideScoreExceedsMax", 400);
    }

    // Verify the target user is enrolled in the group
    const targetEnrollment = await db.query.enrollments.findFirst({
      where: and(eq(enrollments.groupId, result.groupId), eq(enrollments.userId, userId)),
      columns: { id: true },
    });
    if (!targetEnrollment) {
      return apiError("userNotEnrolled", 400);
    }

    // Upsert: delete existing then insert (atomic transaction)
    sqlite.transaction(() => {
      db.delete(scoreOverrides)
        .where(
          and(
            eq(scoreOverrides.assignmentId, assignment.id),
            eq(scoreOverrides.problemId, problemId),
            eq(scoreOverrides.userId, userId)
          )
        )
        .run();

      db.insert(scoreOverrides)
        .values({
          assignmentId: assignment.id,
          problemId,
          userId,
          overrideScore,
          reason: reason ?? null,
          createdBy: user.id,
          createdAt: new Date(),
        })
        .run();
    })();

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
      request,
    });

    return apiSuccess({ assignmentId: assignment.id, problemId, userId, overrideScore, reason });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/groups/[id]/assignments/[assignmentId]/overrides error");
    return apiError("overrideCreateFailed", 500);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  try {
    const result = await resolveAssignmentAndAuthorize(request, params);
    if ("error" in result) return result.error;

    const { assignment } = result;

    const overrides = db
      .select()
      .from(scoreOverrides)
      .where(eq(scoreOverrides.assignmentId, assignment.id))
      .all();

    return apiSuccess(overrides);
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/groups/[id]/assignments/[assignmentId]/overrides error");
    return apiError("overrideLoadFailed", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = consumeApiRateLimit(request, "overrides:delete");
    if (rateLimitResponse) return rateLimitResponse;

    const result = await resolveAssignmentAndAuthorize(request, params);
    if ("error" in result) return result.error;

    const { user, assignment } = result;

    const { searchParams } = new URL(request.url);
    const queryParsed = deleteOverrideQuerySchema.safeParse({
      problemId: searchParams.get("problemId") ?? "",
      userId: searchParams.get("userId") ?? "",
    });

    if (!queryParsed.success) {
      return apiError(queryParsed.error.issues[0]?.message ?? "invalidInput", 400);
    }

    const { problemId, userId } = queryParsed.data;

    const deleted = db
      .delete(scoreOverrides)
      .where(
        and(
          eq(scoreOverrides.assignmentId, assignment.id),
          eq(scoreOverrides.problemId, problemId),
          eq(scoreOverrides.userId, userId)
        )
      )
      .run();

    if (deleted.changes === 0) {
      return notFound("ScoreOverride");
    }

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
      request,
    });

    return apiSuccess({ assignmentId: assignment.id, problemId, userId });
  } catch (error) {
    logger.error({ err: error }, "DELETE /api/v1/groups/[id]/assignments/[assignmentId]/overrides error");
    return apiError("overrideDeleteFailed", 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sqlite } from "@/lib/db";
import { assignments, scoreOverrides } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import { canManageGroupResources } from "@/lib/assignments/management";
import { getApiUser, forbidden, notFound, unauthorized, csrfForbidden } from "@/lib/api/auth";
import { assertUserRole } from "@/lib/security/constants";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

const scoreOverrideBodySchema = z.object({
  problemId: z.string().min(1),
  userId: z.string().min(1),
  overrideScore: z.number().int().min(0),
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

  const canManage = canManageGroupResources(
    group.instructorId,
    user.id,
    assertUserRole(user.role as string)
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

    const rateLimitResponse = checkApiRateLimit(request, "overrides:upsert");
    if (rateLimitResponse) return rateLimitResponse;
    recordApiRateHit(request, "overrides:upsert");

    const result = await resolveAssignmentAndAuthorize(request, params);
    if ("error" in result) return result.error;

    const { user, assignment } = result;

    const body = await request.json();
    const parsed = scoreOverrideBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalidInput" },
        { status: 400 }
      );
    }

    const { problemId, userId, overrideScore, reason } = parsed.data;

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

    return NextResponse.json({ data: { assignmentId: assignment.id, problemId, userId, overrideScore, reason } });
  } catch (error) {
    console.error("POST /api/v1/groups/[id]/assignments/[assignmentId]/overrides error:", error);
    return NextResponse.json({ error: "overrideCreateFailed" }, { status: 500 });
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

    return NextResponse.json({ data: overrides });
  } catch (error) {
    console.error("GET /api/v1/groups/[id]/assignments/[assignmentId]/overrides error:", error);
    return NextResponse.json({ error: "overrideLoadFailed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = checkApiRateLimit(request, "overrides:delete");
    if (rateLimitResponse) return rateLimitResponse;
    recordApiRateHit(request, "overrides:delete");

    const result = await resolveAssignmentAndAuthorize(request, params);
    if ("error" in result) return result.error;

    const { user, assignment } = result;

    const { searchParams } = new URL(request.url);
    const queryParsed = deleteOverrideQuerySchema.safeParse({
      problemId: searchParams.get("problemId") ?? "",
      userId: searchParams.get("userId") ?? "",
    });

    if (!queryParsed.success) {
      return NextResponse.json(
        { error: queryParsed.error.issues[0]?.message ?? "invalidInput" },
        { status: 400 }
      );
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

    return NextResponse.json({ data: { assignmentId: assignment.id, problemId, userId } });
  } catch (error) {
    console.error("DELETE /api/v1/groups/[id]/assignments/[assignmentId]/overrides error:", error);
    return NextResponse.json({ error: "overrideDeleteFailed" }, { status: 500 });
  }
}

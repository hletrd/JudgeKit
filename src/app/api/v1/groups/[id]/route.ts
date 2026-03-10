import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assignments, groups, submissions, enrollments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { canAccessGroup } from "@/lib/auth/permissions";
import { getApiUser, unauthorized, forbidden, notFound, isAdmin, csrfForbidden } from "@/lib/api/auth";
import { recordAuditEvent } from "@/lib/audit/events";
import { updateGroupSchema } from "@/lib/validators/groups";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const existingGroup = await db.query.groups.findFirst({
      where: eq(groups.id, id),
      columns: { id: true },
    });

    if (!existingGroup) return notFound("Group");

    const hasAccess = await canAccessGroup(id, user.id, user.role);

    if (!hasAccess) return forbidden();

    const group = await db.query.groups.findFirst({
      where: eq(groups.id, id),
      columns: {
        id: true,
        name: true,
        description: true,
        instructorId: true,
        isArchived: true,
        createdAt: true,
        updatedAt: true,
      },
      with: {
        instructor: {
          columns: { id: true, name: true, email: true },
        },
        enrollments: {
          columns: {
            id: true,
            userId: true,
            groupId: true,
            enrolledAt: true,
          },
          with: {
            user: {
              columns: { id: true, name: true, email: true },
            },
          },
          limit: 50,
        },
      },
    });

    if (!group) return notFound("Group");

    // Get total member count for pagination
    const memberCountResult = await db
      .select({ count: sql<number>`count(${enrollments.id})` })
      .from(enrollments)
      .where(eq(enrollments.groupId, id));
    const memberCount = Number(memberCountResult[0]?.count ?? 0);

    const canViewEmails = isAdmin(user.role) || group.instructorId === user.id;

    return NextResponse.json({
      data: {
        ...group,
        memberCount,
        instructor: group.instructor
          ? {
              ...group.instructor,
              email: canViewEmails ? group.instructor.email : null,
            }
          : null,
        enrollments: group.enrollments.map((enrollment) => ({
          ...enrollment,
          user: {
            ...enrollment.user,
            email: canViewEmails ? enrollment.user.email : null,
          },
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/v1/groups/[id] error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = checkApiRateLimit(request, "groups:update");
    if (rateLimitResponse) return rateLimitResponse;
    recordApiRateHit(request, "groups:update");

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const group = await db.query.groups.findFirst({ where: eq(groups.id, id) });
    if (!group) return notFound("Group");

    if (!isAdmin(user.role) && group.instructorId !== user.id) return forbidden();

    const body = await request.json();
    const parsed = updateGroupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "validationError" },
        { status: 400 }
      );
    }

    const { name, description, isArchived } = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description ?? null;
    if (isArchived !== undefined) updates.isArchived = isArchived;

    await db.update(groups).set(updates).where(eq(groups.id, id));

    const updated = await db.query.groups.findFirst({ where: eq(groups.id, id) });

    if (updated) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "group.updated",
        resourceType: "group",
        resourceId: updated.id,
        resourceLabel: updated.name,
        summary: `Updated group \"${updated.name}\"`,
        details: {
          changedFields: Object.keys(body).filter((key) => ["name", "description", "isArchived"].includes(key)),
          isArchived: updated.isArchived,
        },
        request,
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/v1/groups/[id] error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = checkApiRateLimit(request, "groups:delete");
    if (rateLimitResponse) return rateLimitResponse;
    recordApiRateHit(request, "groups:delete");

    const user = await getApiUser(request);
    if (!user) return unauthorized();
    if (!isAdmin(user.role)) return forbidden();

    const { id } = await params;
    const group = await db.query.groups.findFirst({ where: eq(groups.id, id) });
    if (!group) return notFound("Group");

    const assignmentSubmissionCountRow = await db
      .select({ total: sql<number>`count(${submissions.id})` })
      .from(assignments)
      .innerJoin(submissions, eq(submissions.assignmentId, assignments.id))
      .where(eq(assignments.groupId, id))
      .then((rows) => rows[0] ?? { total: 0 });

    const assignmentSubmissionCount = Number(assignmentSubmissionCountRow.total ?? 0);

    if (assignmentSubmissionCount > 0) {
      return NextResponse.json(
        {
          error: "groupDeleteBlocked",
          details: {
            assignmentSubmissionCount,
          },
        },
        { status: 409 }
      );
    }

    await db.delete(groups).where(eq(groups.id, id));

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "group.deleted",
      resourceType: "group",
      resourceId: group.id,
      resourceLabel: group.name,
      summary: `Deleted group \"${group.name}\"`,
      details: {
        isArchived: group.isArchived,
      },
      request,
    });

    return NextResponse.json({ data: { id } });
  } catch (error) {
    console.error("DELETE /api/v1/groups/[id] error:", error);
    return NextResponse.json({ error: "internalServerError" }, { status: 500 });
  }
}

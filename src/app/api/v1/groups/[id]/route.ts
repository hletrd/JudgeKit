import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { assignments, groups, submissions, enrollments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { canAccessGroup } from "@/lib/auth/permissions";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { recordAuditEvent } from "@/lib/audit/events";
import { updateGroupSchema } from "@/lib/validators/groups";
import { withUpdatedAt } from "@/lib/db/helpers";
import { execTransaction } from "@/lib/db";
import { createApiHandler, notFound, forbidden } from "@/lib/api/handler";
import { resolveCapabilities, getRoleLevel } from "@/lib/capabilities/cache";
import { parsePagination } from "@/lib/api/pagination";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
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
      },
    });

    if (!group) return notFound("Group");

    const hasAccess = await canAccessGroup(id, user.id, user.role);
    if (!hasAccess) return forbidden();

    const { page, limit, offset } = parsePagination(req.nextUrl.searchParams, {
      defaultLimit: 100,
      maxLimit: 500,
    });

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.groupId, id));
    const total = Number(totalRow?.count ?? 0);

    const groupEnrollments = await db.query.enrollments.findMany({
      where: eq(enrollments.groupId, id),
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
      limit,
      offset,
    });

    const canViewEmails = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );

    return apiSuccess({
      ...group,
      memberCount: total,
      enrollmentsMeta: {
        page,
        limit,
        total,
      },
      instructor: group.instructor
        ? {
            ...group.instructor,
            email: canViewEmails ? group.instructor.email : null,
          }
        : null,
      enrollments: groupEnrollments.map((enrollment) => ({
        ...enrollment,
        user: {
          ...enrollment.user,
          email: canViewEmails ? enrollment.user.email : null,
        },
      })),
    });
  },
});

export const PATCH = createApiHandler({
  rateLimit: "groups:update",
  schema: updateGroupSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const { id } = params;
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, id),
      columns: { id: true, instructorId: true, name: true },
    });
    if (!group) return notFound("Group");

    const caps = await resolveCapabilities(user.role);
    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );
    const canEditByCapability = caps.has("groups.edit") && (await canAccessGroup(id, user.id, user.role));
    if (!canManage && !canEditByCapability) return forbidden();

    const { name, description, isArchived, instructorId } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description ?? null;
    if (isArchived !== undefined) updates.isArchived = isArchived;
    if (instructorId !== undefined) {
      const nextInstructor = await db.query.users.findFirst({
        where: (users, { eq: equals }) => equals(users.id, instructorId),
        columns: { id: true, role: true, isActive: true },
      });

      if (!nextInstructor) {
        return apiError("instructorNotFound", 404);
      }
      if (!nextInstructor.isActive || (await getRoleLevel(nextInstructor.role)) <= 0) {
        return apiError("instructorRoleInvalid", 409);
      }
      updates.instructorId = instructorId;
    }

    await db.update(groups).set(withUpdatedAt(updates)).where(eq(groups.id, id));

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
          changedFields: Object.keys(body).filter((key) => ["name", "description", "isArchived", "instructorId"].includes(key)),
          isArchived: updated.isArchived,
          instructorId: updated.instructorId,
        },
        request: req,
      });
    }

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  auth: { capabilities: ["groups.delete"] },
  rateLimit: "groups:delete",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const result = await execTransaction(async (tx) => {
      const [group] = await tx.select({
        id: groups.id,
        name: groups.name,
        isArchived: groups.isArchived,
      }).from(groups).where(eq(groups.id, id)).for("update").limit(1);
      if (!group) return { error: "notFound" as const };

      const [countRow] = await tx
        .select({ total: sql<number>`count(${submissions.id})` })
        .from(assignments)
        .innerJoin(submissions, eq(submissions.assignmentId, assignments.id))
        .where(eq(assignments.groupId, id));

      if (Number(countRow?.total ?? 0) > 0) {
        return { error: "groupDeleteBlocked" as const };
      }

      await tx.delete(groups).where(eq(groups.id, id));
      return { group };
    });

    if (result.error === "notFound") return notFound("Group");
    if (result.error === "groupDeleteBlocked") return apiError("groupDeleteBlocked", 409);

    const group = result.group!;

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
      request: req,
    });

    return apiSuccess({ id });
  },
});

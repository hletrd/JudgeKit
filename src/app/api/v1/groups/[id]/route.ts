import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db, sqlite } from "@/lib/db";
import { assignments, groups, submissions, enrollments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { canAccessGroup } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/events";
import { updateGroupSchema } from "@/lib/validators/groups";
import { withUpdatedAt } from "@/lib/db/helpers";
import { createApiHandler, isAdmin, notFound, forbidden } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const { id } = params;
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

    return apiSuccess({
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
    });
  },
});

export const PATCH = createApiHandler({
  rateLimit: "groups:update",
  schema: updateGroupSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const { id } = params;
    const group = await db.query.groups.findFirst({ where: eq(groups.id, id) });
    if (!group) return notFound("Group");

    if (!isAdmin(user.role) && group.instructorId !== user.id) return forbidden();

    const { name, description, isArchived } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description ?? null;
    if (isArchived !== undefined) updates.isArchived = isArchived;

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
          changedFields: Object.keys(body).filter((key) => ["name", "description", "isArchived"].includes(key)),
          isArchived: updated.isArchived,
        },
        request: req,
      });
    }

    return apiSuccess(updated);
  },
});

export const DELETE = createApiHandler({
  auth: { roles: ["admin", "super_admin"] },
  rateLimit: "groups:delete",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const group = await db.query.groups.findFirst({ where: eq(groups.id, id) });
    if (!group) return notFound("Group");

    let blocked = false;
    sqlite.transaction(() => {
      const assignmentSubmissionCountRow = db
        .select({ total: sql<number>`count(${submissions.id})` })
        .from(assignments)
        .innerJoin(submissions, eq(submissions.assignmentId, assignments.id))
        .where(eq(assignments.groupId, id))
        .get() ?? { total: 0 };

      const assignmentSubmissionCount = Number(assignmentSubmissionCountRow.total ?? 0);

      if (assignmentSubmissionCount > 0) {
        blocked = true;
        return;
      }

      db.delete(groups).where(eq(groups.id, id)).run();
    })();

    if (blocked) {
      return apiError("groupDeleteBlocked", 409);
    }

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

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

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
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
        },
      },
    });

    if (!group) return notFound("Group");

    const hasAccess = await canAccessGroup(id, user.id, user.role);

    if (!hasAccess) return forbidden();

    // Get total member count for pagination
    const memberCountResult = await db
      .select({ count: sql<number>`count(${enrollments.id})` })
      .from(enrollments)
      .where(eq(enrollments.groupId, id));
    const memberCount = Number(memberCountResult[0]?.count ?? 0);
    const returnedEnrollmentCount = group.enrollments.length;
    const enrollmentsMeta = {
      totalCount: memberCount,
      returnedCount: returnedEnrollmentCount,
      isComplete: returnedEnrollmentCount >= memberCount,
    };

    const canViewEmails = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );

    return apiSuccess({
      ...group,
      memberCount,
      membersTruncated: !enrollmentsMeta.isComplete,
      enrollmentsMeta,
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

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );
    if (!canManage) return forbidden();

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
  auth: { capabilities: ["groups.delete"] },
  rateLimit: "groups:delete",
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
    const result = await execTransaction(async (tx) => {
      const [group] = await tx.select().from(groups).where(eq(groups.id, id)).for("update").limit(1);
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

import { NextRequest } from "next/server";
import { apiError, apiPaginated, apiSuccess } from "@/lib/api/responses";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { enrollments, users } from "@/lib/db/schema";
import { canManageGroupMembersAsync } from "@/lib/assignments/management";
import { groupMembershipSchema } from "@/lib/validators/groups";
import { canAccessGroup } from "@/lib/auth/permissions";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { parsePagination } from "@/lib/api/pagination";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    const { id } = params;
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

    const members = await db.query.enrollments.findMany({
      where: eq(enrollments.groupId, id),
      limit,
      offset,
      with: {
        user: {
          columns: {
            id: true,
            username: true,
            name: true,
            className: true,
            isActive: true,
          },
        },
      },
    });

    return apiPaginated(members, page, limit, total);
  },
});

export const POST = createApiHandler({
  rateLimit: "members:add",
  schema: groupMembershipSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    const { id } = params;
    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    const canManage = await canManageGroupMembersAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );

    if (!canManage) return forbidden();

    const student = await db.query.users.findFirst({
      where: eq(users.id, body.userId),
      columns: {
        id: true,
        username: true,
        name: true,
        className: true,
        role: true,
        isActive: true,
      },
    });

    if (!student) {
      return apiError("studentNotFound", 404);
    }

    if (!student.isActive) {
      return apiError("studentInactive", 409);
    }

    if (student.role !== "student") {
      return apiError("studentRoleInvalid", 409);
    }

    const enrollmentId = nanoid();
    const [inserted] = await db.insert(enrollments).values({
      id: enrollmentId,
      groupId: id,
      userId: body.userId,
      enrolledAt: new Date(),
    }).onConflictDoNothing({
      target: [enrollments.userId, enrollments.groupId],
    }).returning({ id: enrollments.id });

    if (!inserted) {
      return apiError("studentAlreadyEnrolled", 409);
    }

    const createdEnrollment = await db.query.enrollments.findFirst({
      where: eq(enrollments.id, enrollmentId),
      with: {
        user: {
          columns: {
            id: true,
            username: true,
            name: true,
            className: true,
            isActive: true,
          },
        },
      },
    });

    if (createdEnrollment?.user) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "group.member_added",
        resourceType: "group_member",
        resourceId: createdEnrollment.user.id,
        resourceLabel: createdEnrollment.user.username,
        summary: `Added @${createdEnrollment.user.username} to group membership`,
        details: {
          groupId: id,
          username: createdEnrollment.user.username,
        },
        request: req,
      });
    }

    return apiSuccess(createdEnrollment, { status: 201 });
  },
});

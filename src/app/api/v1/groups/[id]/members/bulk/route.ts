import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { enrollments } from "@/lib/db/schema";
import { canManageGroupMembersAsync } from "@/lib/assignments/management";
import { bulkEnrollmentSchema } from "@/lib/validators/groups";
import { forbidden, notFound, createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";

export const POST = createApiHandler({
  rateLimit: "members:bulk-add",
  handler: async (req: NextRequest, { user, params }) => {
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

    const body = await req.json();
    const parsedInput = bulkEnrollmentSchema.safeParse(body);

    if (!parsedInput.success) {
      return apiError(parsedInput.error.issues[0]?.message ?? "bulkEnrollFailed", 400);
    }

    const { userIds } = parsedInput.data;
    const uniqueRequestedUserIds = Array.from(new Set(userIds));

    // Validate all users exist, are active, and have student role in a single query
    const validStudents = await db.query.users.findMany({
      where: (usersTable, { and, eq: equals, inArray: inArr }) =>
        and(
          inArr(usersTable.id, uniqueRequestedUserIds),
          equals(usersTable.isActive, true),
          equals(usersTable.role, "student")
        ),
      columns: { id: true, username: true },
    });

    const validStudentIds = new Set(validStudents.map((s) => s.id));

    if (validStudents.length === 0) {
      return apiSuccess({ enrolled: 0, skipped: userIds.length });
    }

    // Check existing enrollments to count skipped duplicates
    const existingEnrollments = await db.query.enrollments.findMany({
      where: (enrollmentsTable, { and, eq: equals, inArray: inArr }) =>
        and(
          equals(enrollmentsTable.groupId, id),
          inArr(enrollmentsTable.userId, Array.from(validStudentIds))
        ),
      columns: { userId: true },
    });

    const alreadyEnrolledIds = new Set(existingEnrollments.map((e) => e.userId));
    const toEnroll = validStudents.filter((s) => !alreadyEnrolledIds.has(s.id));

    let enrolled = 0;

    if (toEnroll.length > 0) {
      const now = new Date();
      const rows = toEnroll.map((student) => ({
        id: nanoid(),
        groupId: id,
        userId: student.id,
        enrolledAt: now,
      }));

      const inserted = await db.insert(enrollments).values(rows).onConflictDoNothing().returning({ id: enrollments.id });

      enrolled = inserted.length;
    }

    const skipped = userIds.length - enrolled;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "group.members_bulk_added",
      resourceType: "group_member",
      resourceId: id,
      resourceLabel: `group:${id}`,
      summary: `Bulk enrolled ${enrolled} student(s) into group (${skipped} skipped)`,
      details: {
        groupId: id,
        requested: userIds.length,
        enrolled,
        skipped,
      },
      request: req,
    });

    return apiSuccess({ enrolled, skipped });
  },
});

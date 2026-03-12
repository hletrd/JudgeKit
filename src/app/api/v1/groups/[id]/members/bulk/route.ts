import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { enrollments } from "@/lib/db/schema";
import { canManageGroupResources } from "@/lib/assignments/management";
import { bulkEnrollmentSchema } from "@/lib/validators/groups";
import { getApiUser, forbidden, notFound, unauthorized, csrfForbidden } from "@/lib/api/auth";
import { isUserRole } from "@/lib/security/constants";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = consumeApiRateLimit(request, "members:bulk-add");
    if (rateLimitResponse) return rateLimitResponse;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    if (!isUserRole(user.role)) return forbidden();
    const canManage = canManageGroupResources(
      group.instructorId,
      user.id,
      user.role
    );

    if (!canManage) return forbidden();

    const body = await request.json();
    const parsedInput = bulkEnrollmentSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: parsedInput.error.issues[0]?.message ?? "bulkEnrollFailed" },
        { status: 400 }
      );
    }

    const { userIds } = parsedInput.data;

    // Validate all users exist, are active, and have student role in a single query
    const validStudents = await db.query.users.findMany({
      where: (usersTable, { and, eq: equals, inArray: inArr }) =>
        and(
          inArr(usersTable.id, userIds),
          equals(usersTable.isActive, true),
          equals(usersTable.role, "student")
        ),
      columns: { id: true, username: true },
    });

    const validStudentIds = new Set(validStudents.map((s) => s.id));
    const skippedInvalid = userIds.filter((id) => !validStudentIds.has(id)).length;

    if (validStudents.length === 0) {
      return NextResponse.json({ enrolled: 0, skipped: userIds.length });
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
    const skippedDuplicates = validStudents.length - toEnroll.length;

    let enrolled = 0;

    if (toEnroll.length > 0) {
      const now = new Date();
      const rows = toEnroll.map((student) => ({
        id: nanoid(),
        groupId: id,
        userId: student.id,
        enrolledAt: now,
      }));

      await db.transaction(async (tx) => {
        await tx.insert(enrollments).values(rows).onConflictDoNothing();
      });

      enrolled = toEnroll.length;
    }

    const skipped = skippedInvalid + skippedDuplicates;

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
      request,
    });

    return NextResponse.json({ enrolled, skipped });
  } catch (error) {
    console.error("POST /api/v1/groups/[id]/members/bulk error:", error);
    return NextResponse.json({ error: "bulkEnrollFailed" }, { status: 500 });
  }
}

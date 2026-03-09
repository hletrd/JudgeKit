import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { enrollments, users } from "@/lib/db/schema";
import { canManageGroupResources } from "@/lib/assignments/management";
import { groupMembershipSchema } from "@/lib/validators/groups";
import { getApiUser, forbidden, notFound, unauthorized, csrfForbidden } from "@/lib/api/auth";
import { canAccessGroup } from "@/lib/auth/permissions";
import type { UserRole } from "@/types";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const hasAccess = await canAccessGroup(id, user.id, user.role as UserRole);
    if (!hasAccess) return forbidden();

    const members = await db.query.enrollments.findMany({
      where: eq(enrollments.groupId, id),
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

    return NextResponse.json({ data: members });
  } catch (error) {
    console.error("GET /api/v1/groups/[id]/members error:", error);
    return NextResponse.json({ error: "memberLoadFailed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    const canManage = canManageGroupResources(
      group.instructorId,
      user.id,
      user.role as UserRole
    );

    if (!canManage) return forbidden();

    const body = await request.json();
    const parsedInput = groupMembershipSchema.safeParse(body);

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: parsedInput.error.issues[0]?.message ?? "memberAddFailed" },
        { status: 400 }
      );
    }

    const student = await db.query.users.findFirst({
      where: eq(users.id, parsedInput.data.userId),
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
      return NextResponse.json({ error: "studentNotFound" }, { status: 404 });
    }

    if (!student.isActive) {
      return NextResponse.json({ error: "studentInactive" }, { status: 409 });
    }

    if (student.role !== "student") {
      return NextResponse.json({ error: "studentRoleInvalid" }, { status: 409 });
    }

    const existingEnrollment = await db.query.enrollments.findFirst({
      where: (enrollmentsTable, { and, eq: equals }) =>
        and(
          equals(enrollmentsTable.groupId, id),
          equals(enrollmentsTable.userId, parsedInput.data.userId)
        ),
      columns: { id: true },
    });

    if (existingEnrollment) {
      return NextResponse.json({ error: "studentAlreadyEnrolled" }, { status: 409 });
    }

    const enrollmentId = nanoid();
    await db.insert(enrollments).values({
      id: enrollmentId,
      groupId: id,
      userId: parsedInput.data.userId,
      enrolledAt: new Date(),
    });

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
        request,
      });
    }

    return NextResponse.json({ data: createdEnrollment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/groups/[id]/members error:", error);
    return NextResponse.json({ error: "memberAddFailed" }, { status: 500 });
  }
}

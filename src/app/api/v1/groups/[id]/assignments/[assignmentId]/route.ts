import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, submissions } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  canManageGroupResources,
  deleteAssignmentWithProblems,
  getManageableProblemsForGroup,
  updateAssignmentWithProblems,
} from "@/lib/assignments/management";
import { assignmentMutationSchema } from "@/lib/validators/assignments";
import { getApiUser, forbidden, notFound, unauthorized } from "@/lib/api/auth";
import { canAccessGroup } from "@/lib/auth/permissions";
import type { UserRole } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id, assignmentId } = await params;
    const hasAccess = await canAccessGroup(id, user.id, user.role as UserRole);
    if (!hasAccess) return forbidden();

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      with: {
        assignmentProblems: {
          with: {
            problem: {
              columns: { id: true, title: true },
            },
          },
        },
      },
    });

    if (!assignment || assignment.groupId !== id) {
      return notFound("Assignment");
    }

    return NextResponse.json({ data: assignment });
  } catch (error) {
    console.error("GET /api/v1/groups/[id]/assignments/[assignmentId] error:", error);
    return NextResponse.json({ error: "assignmentLoadFailed" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id, assignmentId } = await params;
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

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      with: {
        assignmentProblems: {
          with: {
            problem: {
              columns: { id: true },
            },
          },
        },
      },
    });

    if (!assignment || assignment.groupId !== id) {
      return notFound("Assignment");
    }

    const body = await request.json();
    const hasExistingSubmissions = Boolean(
      await db.query.submissions.findFirst({
        where: eq(submissions.assignmentId, assignmentId),
        columns: { id: true },
      })
    );

    if (body.problems !== undefined && hasExistingSubmissions) {
      return NextResponse.json({ error: "assignmentProblemsLocked" }, { status: 409 });
    }

    const parsedInput = assignmentMutationSchema.safeParse({
      title: body.title ?? assignment.title,
      description: body.description ?? assignment.description ?? undefined,
      startsAt:
        body.startsAt !== undefined
          ? body.startsAt
          : assignment.startsAt
            ? assignment.startsAt.valueOf()
            : null,
      deadline:
        body.deadline !== undefined
          ? body.deadline
          : assignment.deadline
            ? assignment.deadline.valueOf()
            : null,
      lateDeadline:
        body.lateDeadline !== undefined
          ? body.lateDeadline
          : assignment.lateDeadline
            ? assignment.lateDeadline.valueOf()
            : null,
      latePenalty: body.latePenalty ?? assignment.latePenalty ?? 0,
      problems:
        body.problems ??
        assignment.assignmentProblems
          .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
          .map((problem) => ({
            problemId: problem.problemId,
            points: problem.points ?? 100,
          })),
    });

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: parsedInput.error.issues[0]?.message ?? "assignmentUpdateFailed" },
        { status: 400 }
      );
    }

    if (body.problems !== undefined) {
      const manageableProblemIds = new Set(
        (
          await getManageableProblemsForGroup(id, user.id, user.role as UserRole)
        ).map((problem) => problem.id)
      );

      if (
        parsedInput.data.problems.some((problem) => !manageableProblemIds.has(problem.problemId))
      ) {
        return NextResponse.json({ error: "assignmentProblemForbidden" }, { status: 403 });
      }
    }

    updateAssignmentWithProblems(assignmentId, parsedInput.data);

    const updatedAssignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      with: {
        assignmentProblems: {
          with: {
            problem: {
              columns: { id: true, title: true },
            },
          },
        },
      },
    });

    if (updatedAssignment) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "assignment.updated",
        resourceType: "assignment",
        resourceId: updatedAssignment.id,
        resourceLabel: updatedAssignment.title,
        summary: `Updated assignment \"${updatedAssignment.title}\"`,
        details: {
          groupId: id,
          problemCount: updatedAssignment.assignmentProblems.length,
          problemLinksChanged: body.problems !== undefined,
          latePenalty: updatedAssignment.latePenalty ?? 0,
        },
        request,
      });
    }

    return NextResponse.json({ data: updatedAssignment });
  } catch (error) {
    console.error("PATCH /api/v1/groups/[id]/assignments/[assignmentId] error:", error);
    return NextResponse.json({ error: "assignmentUpdateFailed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id, assignmentId } = await params;
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

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, groupId: true, title: true },
    });

    if (!assignment || assignment.groupId !== id) {
      return notFound("Assignment");
    }

    const submissionCountRow = await db
      .select({ total: sql<number>`count(${submissions.id})` })
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId))
      .then((rows) => rows[0] ?? { total: 0 });

    const submissionCount = Number(submissionCountRow.total ?? 0);

    if (submissionCount > 0) {
      return NextResponse.json(
        {
          error: "assignmentDeleteBlocked",
          details: {
            submissionCount,
          },
        },
        { status: 409 }
      );
    }

    deleteAssignmentWithProblems(assignmentId);

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "assignment.deleted",
      resourceType: "assignment",
      resourceId: assignment.id,
      resourceLabel: assignment.title,
      summary: `Deleted assignment "${assignment.title}"`,
      details: {
        groupId: id,
      },
      request,
    });

    return NextResponse.json({ data: { id: assignmentId } });
  } catch (error) {
    console.error("DELETE /api/v1/groups/[id]/assignments/[assignmentId] error:", error);
    return NextResponse.json({ error: "assignmentDeleteFailed" }, { status: 500 });
  }
}

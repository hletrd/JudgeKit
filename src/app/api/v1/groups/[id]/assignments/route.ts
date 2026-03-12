import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  createAssignmentWithProblems,
  canManageGroupResources,
  getManageableProblemsForGroup,
} from "@/lib/assignments/management";
import { assignmentMutationSchema } from "@/lib/validators/assignments";
import { getApiUser, forbidden, notFound, unauthorized, csrfForbidden } from "@/lib/api/auth";
import { canAccessGroup } from "@/lib/auth/permissions";
import { assertUserRole } from "@/lib/security/constants";
import { checkApiRateLimit, recordApiRateHit } from "@/lib/security/api-rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true },
    });

    if (!group) return notFound("Group");

    const hasAccess = await canAccessGroup(id, user.id, assertUserRole(user.role as string));
    if (!hasAccess) return forbidden();

    const groupAssignments = await db.query.assignments.findMany({
      where: eq(assignments.groupId, id),
      orderBy: [desc(assignments.createdAt)],
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

    return NextResponse.json({ data: groupAssignments });
  } catch (error) {
    console.error("GET /api/v1/groups/[id]/assignments error:", error);
    return NextResponse.json({ error: "assignmentLoadFailed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = checkApiRateLimit(request, "assignments:create");
    if (rateLimitResponse) return rateLimitResponse;
    recordApiRateHit(request, "assignments:create");

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
      assertUserRole(user.role as string)
    );

    if (!canManage) return forbidden();

    const body = await request.json();
    const parsedInput = assignmentMutationSchema.safeParse({
      title: body.title,
      description: body.description,
      startsAt: body.startsAt ?? null,
      deadline: body.deadline ?? null,
      lateDeadline: body.lateDeadline ?? null,
      latePenalty: body.latePenalty ?? 0,
      problems: body.problems ?? [],
    });

    if (!parsedInput.success) {
      return NextResponse.json(
        { error: parsedInput.error.issues[0]?.message ?? "assignmentCreateFailed" },
        { status: 400 }
      );
    }

    const manageableProblemIds = new Set(
      (
        await getManageableProblemsForGroup(id, user.id, assertUserRole(user.role as string))
      ).map((problem) => problem.id)
    );

    if (
      parsedInput.data.problems.some((problem) => !manageableProblemIds.has(problem.problemId))
    ) {
      return NextResponse.json({ error: "assignmentProblemForbidden" }, { status: 403 });
    }

    const assignmentId = createAssignmentWithProblems(id, parsedInput.data);
    const createdAssignment = await db.query.assignments.findFirst({
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

    if (createdAssignment) {
      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "assignment.created",
        resourceType: "assignment",
        resourceId: createdAssignment.id,
        resourceLabel: createdAssignment.title,
        summary: `Created assignment \"${createdAssignment.title}\"`,
        details: {
          groupId: id,
          problemCount: createdAssignment.assignmentProblems.length,
          latePenalty: createdAssignment.latePenalty ?? 0,
        },
        request,
      });
    }

    return NextResponse.json({ data: createdAssignment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/groups/[id]/assignments error:", error);
    return NextResponse.json({ error: "assignmentCreateFailed" }, { status: 500 });
  }
}

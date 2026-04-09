import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  createAssignmentWithProblems,
  canManageGroupResourcesAsync,
  getManageableProblemsForGroup,
} from "@/lib/assignments/management";
import { assignmentMutationSchema } from "@/lib/validators/assignments";
import { getApiUser, forbidden, notFound, unauthorized, csrfForbidden } from "@/lib/api/auth";
import { canAccessGroup } from "@/lib/auth/permissions";
import { consumeApiRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";

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

    const hasAccess = await canAccessGroup(id, user.id, user.role);
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

    return apiSuccess(groupAssignments);
  } catch (error) {
    logger.error({ err: error }, "GET /api/v1/groups/[id]/assignments error");
    return apiError("assignmentLoadFailed", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = csrfForbidden(request);
    if (csrfError) return csrfError;

    const rateLimitResponse = await consumeApiRateLimit(request, "assignments:create");
    if (rateLimitResponse) return rateLimitResponse;

    const user = await getApiUser(request);
    if (!user) return unauthorized();

    const { id } = await params;
    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
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
      examMode: body.examMode ?? "none",
      examDurationMinutes: body.examDurationMinutes ?? null,
      scoringModel: body.scoringModel ?? "ioi",
      enableAntiCheat: body.enableAntiCheat ?? false,
      problems: body.problems ?? [],
    });

    if (!parsedInput.success) {
      return apiError(parsedInput.error.issues[0]?.message ?? "assignmentCreateFailed", 400);
    }

    const manageableProblemIds = new Set(
      (
        await getManageableProblemsForGroup(id, user.id, user.role)
      ).map((problem) => problem.id)
    );

    if (
      parsedInput.data.problems.some((problem) => !manageableProblemIds.has(problem.problemId))
    ) {
      return apiError("assignmentProblemForbidden", 403);
    }

    const assignmentId = await createAssignmentWithProblems(id, parsedInput.data);
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

    return apiSuccess(createdAssignment, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "POST /api/v1/groups/[id]/assignments error");
    return apiError("assignmentCreateFailed", 500);
  }
}

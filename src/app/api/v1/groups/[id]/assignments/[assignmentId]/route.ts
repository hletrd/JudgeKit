import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
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
import { canAccessGroup } from "@/lib/auth/permissions";
import { isUserRole } from "@/lib/security/constants";
import { createApiHandler, isAdmin, forbidden, notFound } from "@/lib/api/handler";

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const { id, assignmentId } = params;
    if (!isUserRole(user.role)) return forbidden();
    const hasAccess = await canAccessGroup(id, user.id, user.role);
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

    return apiSuccess(assignment);
  },
});

export const PATCH = createApiHandler({
  rateLimit: "assignments:update",
  handler: async (req: NextRequest, { user, params }) => {
    const { id, assignmentId } = params;
    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    const canManage = canManageGroupResources(
      group.instructorId,
      user.id,
      user.role
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

    const body = await req.json();
    const allowLockedProblems = Boolean(body.allowLockedProblems);
    const hasExistingSubmissions = Boolean(
      await db.query.submissions.findFirst({
        where: eq(submissions.assignmentId, assignmentId),
        columns: { id: true },
      })
    );

    // Block problem changes during active exam-mode contests
    if (body.problems !== undefined && assignment.examMode !== "none") {
      const now = Date.now();
      const startsAt = assignment.startsAt ? new Date(assignment.startsAt).getTime() : null;
      if (startsAt && now >= startsAt) {
        return apiError("contestProblemsLockedDuringActive", 409);
      }
    }

    if (
      body.problems !== undefined &&
      hasExistingSubmissions &&
      !(allowLockedProblems && isAdmin(user.role))
    ) {
      return apiError("assignmentProblemsLocked", 409);
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
      examMode: body.examMode ?? assignment.examMode ?? "none",
      examDurationMinutes: body.examDurationMinutes !== undefined ? body.examDurationMinutes : assignment.examDurationMinutes ?? null,
      scoringModel: body.scoringModel ?? assignment.scoringModel ?? "ioi",
      enableAntiCheat: body.enableAntiCheat ?? assignment.enableAntiCheat ?? false,
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
      return apiError(parsedInput.error.issues[0]?.message ?? "assignmentUpdateFailed", 400);
    }

    if (body.problems !== undefined) {
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
    }

    try {
      updateAssignmentWithProblems(assignmentId, parsedInput.data);
    } catch (error) {
      if (error instanceof Error && (error.message === "examModeChangeBlocked" || error.message === "examTimingChangeBlocked")) {
        return apiError(error.message, 409);
      }
      throw error;
    }

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
          problemLinkOverrideUsed: allowLockedProblems && isAdmin(user.role),
          latePenalty: updatedAssignment.latePenalty ?? 0,
        },
        request: req,
      });
    }

    return apiSuccess(updatedAssignment);
  },
});

export const DELETE = createApiHandler({
  rateLimit: "assignments:delete",
  handler: async (req: NextRequest, { user, params }) => {
    const { id, assignmentId } = params;
    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });

    if (!group) return notFound("Group");

    const canManage = canManageGroupResources(
      group.instructorId,
      user.id,
      user.role
    );

    if (!canManage) return forbidden();

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, groupId: true, title: true },
    });

    if (!assignment || assignment.groupId !== id) {
      return notFound("Assignment");
    }

    try {
      deleteAssignmentWithProblems(assignmentId);
    } catch (error) {
      if (error instanceof Error && error.message === "assignmentDeleteBlocked") {
        return apiError("assignmentDeleteBlocked", 409);
      }
      throw error;
    }

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
      request: req,
    });

    return apiSuccess({ id: assignmentId });
  },
});

import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, submissions } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  canManageGroupResourcesAsync,
  deleteAssignmentWithProblems,
  getManageableProblemsForGroup,
  updateAssignmentWithProblems,
} from "@/lib/assignments/management";
import { assignmentMutationSchema, assignmentPatchSchema } from "@/lib/validators/assignments";
import { canAccessGroup } from "@/lib/auth/permissions";
import { DEFAULT_PROBLEM_POINTS } from "@/lib/assignments/constants";
import { createApiHandler, isAdminAsync, forbidden, notFound } from "@/lib/api/handler";
import { getDbNowUncached } from "@/lib/db-time";

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const { id, assignmentId } = params;
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
  schema: assignmentPatchSchema,
  handler: async (req: NextRequest, { user, params, body }) => {
    const { id, assignmentId } = params;
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

    // Use transaction for atomic read-check-update to prevent TOCTOU races
    const allowLockedProblems = Boolean(body.allowLockedProblems);
    // Intentional break-glass override: once submissions exist, changing
    // assignment problem links requires admin-level privileges. Uses the
    // async check so custom admin-level roles are also covered.
    const isUserAdmin = await isAdminAsync(user.role);

    const patchResult = await db.transaction(async (tx) => {
      const assignment = await tx.query.assignments.findFirst({
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
        return { error: notFound("Assignment") };
      }

      const hasExistingSubmissions = Boolean(
        await tx.query.submissions.findFirst({
          where: eq(submissions.assignmentId, assignmentId),
          columns: { id: true },
        })
      );

      // Block problem changes during active exam-mode contests.
      // Use DB server time (not Date.now()) to avoid clock skew between
      // the app server and DB server — consistent with recruiting invitation
      // routes and submission deadline enforcement.
      if (body.problems !== undefined && assignment.examMode !== "none") {
        const now = await getDbNowUncached();
        const startsAt = assignment.startsAt ? new Date(assignment.startsAt).getTime() : null;
        if (startsAt && now.getTime() >= startsAt) {
          return { error: apiError("contestProblemsLockedDuringActive", 409) };
        }
      }

      if (
        body.problems !== undefined &&
        hasExistingSubmissions &&
        !(allowLockedProblems && isUserAdmin)
      ) {
        return { error: apiError("assignmentProblemsLocked", 409) };
      }

      return { assignment };
    });

    if ("error" in patchResult && patchResult.error) {
      return patchResult.error;
    }

    const { assignment } = patchResult;

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
      visibility: body.visibility ?? assignment.visibility ?? "private",
      examDurationMinutes: body.examDurationMinutes !== undefined ? body.examDurationMinutes : assignment.examDurationMinutes ?? null,
      scoringModel: body.scoringModel ?? assignment.scoringModel ?? "ioi",
      // Preserve freeze/visibility on partial edits. Omitting these previously
      // let assignmentMutationSchema apply its defaults (freeze=null,
      // show/hide=false), silently un-freezing a live contest's leaderboard and
      // re-exposing candidate results on every edit.
      freezeLeaderboardAt:
        body.freezeLeaderboardAt !== undefined
          ? body.freezeLeaderboardAt
          : assignment.freezeLeaderboardAt
            ? assignment.freezeLeaderboardAt.valueOf()
            : null,
      enableAntiCheat: body.enableAntiCheat ?? assignment.enableAntiCheat ?? false,
      showResultsToCandidate:
        body.showResultsToCandidate ?? assignment.showResultsToCandidate ?? false,
      hideScoresFromCandidates:
        body.hideScoresFromCandidates ?? assignment.hideScoresFromCandidates ?? false,
      problems:
        body.problems ??
        assignment.assignmentProblems
          .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
          .map((problem) => ({
            problemId: problem.problemId,
            points: problem.points ?? DEFAULT_PROBLEM_POINTS,
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
      await updateAssignmentWithProblems(assignmentId, parsedInput.data, {
        problemLinksChanged: body.problems !== undefined,
        allowLockedProblemChanges: allowLockedProblems && isUserAdmin,
      });
    } catch (error) {
      if (
        error instanceof Error
        && (
          error.message === "examModeChangeBlocked"
          || error.message === "examTimingChangeBlocked"
          || error.message === "assignmentProblemsLocked"
        )
      ) {
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
          problemLinkOverrideUsed: allowLockedProblems && isUserAdmin,
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

    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
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
      await deleteAssignmentWithProblems(assignmentId);
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

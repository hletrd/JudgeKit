import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/security/ip";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments, enrollments, groups } from "@/lib/db/schema";
import { recordAuditEvent } from "@/lib/audit/events";
import { startExamSession, getExamSession } from "@/lib/assignments/exam-sessions";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { canAccessGroup } from "@/lib/auth/permissions";
import { isUserRole } from "@/lib/security/constants";
import { resolveCapabilities } from "@/lib/capabilities/cache";

export const POST = createApiHandler({
  rateLimit: "exam-session:start",
  handler: async (req: NextRequest, { user, params }) => {
    const { id, assignmentId } = params;
    if (!isUserRole(user.role)) return forbidden();
    const hasAccess = await canAccessGroup(id, user.id, user.role);
    if (!hasAccess) return forbidden();

    // Verify assignment belongs to group
    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, groupId: true },
    });
    if (!assignment || assignment.groupId !== id) return notFound("Assignment");

    const group = await db.query.groups.findFirst({
      where: eq(groups.id, id),
      columns: { instructorId: true },
    });

    const canManage = await canManageGroupResourcesAsync(
      group?.instructorId ?? null,
      user.id,
      user.role,
      id
    );

    // Verify enrollment for non-managers
    if (!canManage) {
      const enrollment = await db.query.enrollments.findFirst({
        where: and(eq(enrollments.groupId, id), eq(enrollments.userId, user.id)),
        columns: { id: true },
      });
      if (!enrollment) return forbidden();
    }

    try {
      const existingSession = await getExamSession(assignmentId, user.id);
      const ip = extractClientIp(req.headers);
      const session = await startExamSession(assignmentId, user.id, ip);
      const isNewSession = !existingSession;

      if (isNewSession) {
        recordAuditEvent({
          actorId: user.id,
          actorRole: user.role,
          action: "exam_session.started",
          resourceType: "exam_session",
          resourceId: session.id,
          resourceLabel: assignmentId,
          summary: `Started exam session for assignment "${assignmentId}"`,
          request: req,
        });
      }

      return apiSuccess({
        startedAt: session.startedAt.toISOString(),
        personalDeadline: session.personalDeadline.toISOString(),
      }, { status: 201 });
    } catch (error) {
      if (error instanceof Error) {
        switch (error.message) {
          case "assignmentNotFound":
            return notFound("Assignment");
          case "examModeInvalid":
            return apiError("examModeInvalid", 400);
          case "assignmentNotStarted":
            return apiError("assignmentNotStarted", 403);
          case "assignmentClosed":
            return apiError("assignmentClosed", 403);
        }
      }
      throw error;
    }
  },
});

export const GET = createApiHandler({
  handler: async (_req: NextRequest, { user, params }) => {
    const { id, assignmentId } = params;
    if (!isUserRole(user.role)) return forbidden();
    const caps = await resolveCapabilities(user.role);
    const hasAccess = await canAccessGroup(id, user.id, user.role);
    if (!hasAccess) return forbidden();

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, groupId: true },
    });
    if (!assignment || assignment.groupId !== id) return notFound("Assignment");

    // Only group owner or admin can query another user's session
    const url = new URL(_req.url);
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, id),
      columns: { instructorId: true },
    });
    const canManage = await canManageGroupResourcesAsync(
      group?.instructorId ?? null,
      user.id,
      user.role,
      id
    );
    const targetUserId = (canManage || caps.has("contests.view_analytics"))
      ? (url.searchParams.get("userId") ?? user.id)
      : user.id;

    if (targetUserId !== user.id) {
      const targetEnrollment = await db.query.enrollments.findFirst({
        where: and(eq(enrollments.groupId, id), eq(enrollments.userId, targetUserId)),
        columns: { id: true },
      });
      if (!targetEnrollment) return apiError("studentNotFound", 404);
    }

    const session = await getExamSession(assignmentId, targetUserId);
    return apiSuccess(session ? {
      startedAt: session.startedAt.toISOString(),
      personalDeadline: session.personalDeadline.toISOString(),
    } : null);
  },
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assignments } from "@/lib/db/schema";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { canManageGroupResourcesAsync } from "@/lib/assignments/management";
import { extendExamSession } from "@/lib/assignments/exam-sessions";
import { recordAuditEventDurable } from "@/lib/audit/events";

const patchSchema = z.object({
  // 1 minute to 10 hours: covers accommodation letters (×1.5/×2 time) and
  // incident recovery without permitting an effectively-unbounded exam.
  extendMinutes: z.number().int().min(1).max(600),
});

/**
 * PATCH: extend one participant's windowed-exam session (RPF cycle-1 AGG-5).
 *
 * Staff tool for accommodations (extra-time entitlements) and incident
 * recovery (outage ate part of a candidate's window). Extension only — the
 * deadline can never be shrunk through this endpoint. Durably audited.
 */
export const PATCH = createApiHandler({
  rateLimit: "exam-session:extend",
  schema: patchSchema,
  handler: async (_req: NextRequest, { user, params, body }) => {
    const { id, assignmentId, userId } = params;

    const group = await db.query.groups.findFirst({
      where: (groups, { eq: equals }) => equals(groups.id, id),
      columns: { id: true, instructorId: true },
    });
    if (!group) return notFound("Group");

    // Same write-power gate as the rest of the assignment-management surface
    // (score overrides, roster). Monitoring-only staff cannot change time.
    const canManage = await canManageGroupResourcesAsync(
      group.instructorId,
      user.id,
      user.role,
      id
    );
    if (!canManage) return forbidden();

    const assignment = await db.query.assignments.findFirst({
      where: eq(assignments.id, assignmentId),
      columns: { id: true, groupId: true, examMode: true, title: true },
    });
    if (!assignment || assignment.groupId !== id) return notFound("Assignment");
    if (assignment.examMode !== "windowed") {
      // Only windowed exams have per-participant sessions/deadlines.
      return apiError("examModeInvalid", 400);
    }

    const session = await extendExamSession(assignmentId, userId, body.extendMinutes);
    if (!session) {
      // The participant never started the exam — there is no window to extend.
      return apiError("examNotStarted", 404);
    }

    // Durable audit: time extensions change grading-relevant state and must
    // be reconstructable (who granted whom how much, when).
    await recordAuditEventDurable({
      actorId: user.id,
      actorRole: user.role,
      action: "exam_session.extend",
      resourceType: "exam_session",
      resourceId: session.id,
      resourceLabel: assignment.title ?? assignmentId,
      summary: `Extended exam session by ${body.extendMinutes} minute(s) for participant ${userId}`,
      details: {
        assignmentId,
        targetUserId: userId,
        extendMinutes: body.extendMinutes,
        newPersonalDeadline: session.personalDeadline.toISOString(),
      },
    });

    return apiSuccess({
      session: {
        id: session.id,
        userId: session.userId,
        startedAt: session.startedAt.toISOString(),
        personalDeadline: session.personalDeadline.toISOString(),
      },
    });
  },
});

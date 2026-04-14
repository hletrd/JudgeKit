import { and, eq } from "drizzle-orm";
import type { PlatformMode } from "@/types";
import { db } from "@/lib/db";
import { assignments, recruitingInvitations } from "@/lib/db/schema";
import { rawQueryOne } from "@/lib/db/queries";
import { getPlatformModePolicy } from "@/lib/platform-mode";
import { getResolvedPlatformMode, getSystemSettings } from "@/lib/system-settings";

export type PlatformModeContextOptions = {
  userId?: string | null;
  assignmentId?: string | null;
  problemId?: string | null;
};

async function hasRedeemedRecruitingAccess({
  userId,
  assignmentId,
}: PlatformModeContextOptions): Promise<boolean> {
  if (!userId) return false;

  const invitation = await db.query.recruitingInvitations.findFirst({
    where: assignmentId
      ? and(
          eq(recruitingInvitations.userId, userId),
          eq(recruitingInvitations.assignmentId, assignmentId),
          eq(recruitingInvitations.status, "redeemed")
        )
      : and(
          eq(recruitingInvitations.userId, userId),
          eq(recruitingInvitations.status, "redeemed")
        ),
    columns: { id: true },
  });

  return Boolean(invitation);
}

async function getAssignmentPlatformMode(
  assignmentId: string | null | undefined,
  globalMode: PlatformMode
): Promise<PlatformMode | null> {
  if (!assignmentId) return null;

  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: { examMode: true },
  });

  if (!assignment || assignment.examMode === "none") {
    return null;
  }

  return globalMode === "exam" ? "exam" : "contest";
}

type AssignmentContextRow = {
  assignmentId: string;
};

async function findRestrictedAssignmentIdForProblem(
  userId: string,
  problemId: string
): Promise<string | null> {
  const row = await rawQueryOne<AssignmentContextRow>(
    `SELECT a.id AS "assignmentId"
     FROM assignments a
     INNER JOIN assignment_problems ap ON ap.assignment_id = a.id
     WHERE ap.problem_id = @problemId
       AND a.exam_mode != 'none'
       AND (
         EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.group_id = a.group_id AND e.user_id = @userId
         )
         OR EXISTS (
           SELECT 1 FROM contest_access_tokens cat
           WHERE cat.assignment_id = a.id AND cat.user_id = @userId
         )
       )
     ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC
     LIMIT 1`,
    { problemId, userId }
  );

  return row?.assignmentId ?? null;
}

async function findActiveRestrictedAssignmentIdForUser(
  userId: string
): Promise<string | null> {
  const row = await rawQueryOne<AssignmentContextRow>(
    `SELECT a.id AS "assignmentId"
     FROM assignments a
     WHERE a.exam_mode != 'none'
       AND (
         EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.group_id = a.group_id AND e.user_id = @userId
         )
         OR EXISTS (
           SELECT 1 FROM contest_access_tokens cat
           WHERE cat.assignment_id = a.id AND cat.user_id = @userId
         )
       )
       AND (
         (
           a.exam_mode = 'scheduled'
           AND (a.starts_at IS NULL OR a.starts_at <= NOW())
           AND (a.deadline IS NULL OR a.deadline > NOW())
         )
         OR (
           a.exam_mode = 'windowed'
           AND EXISTS (
             SELECT 1 FROM exam_sessions es
             WHERE es.assignment_id = a.id
               AND es.user_id = @userId
               AND (es.personal_deadline IS NULL OR es.personal_deadline > NOW())
           )
         )
       )
     ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC
     LIMIT 1`,
    { userId }
  );

  return row?.assignmentId ?? null;
}

export async function resolvePlatformModeAssignmentContext(
  options: PlatformModeContextOptions = {}
): Promise<string | null> {
  if (options.assignmentId) return options.assignmentId;
  if (!options.userId) return null;
  if (options.problemId) {
    const assignmentId = await findRestrictedAssignmentIdForProblem(
      options.userId,
      options.problemId
    );
    if (assignmentId) return assignmentId;
  }
  return findActiveRestrictedAssignmentIdForUser(options.userId);
}

export async function getEffectivePlatformMode(
  options: PlatformModeContextOptions = {}
): Promise<PlatformMode> {
  const assignmentContextId = await resolvePlatformModeAssignmentContext(options);
  const globalMode = await getResolvedPlatformMode();

  if (globalMode === "recruiting") {
    return "recruiting";
  }

  if (await hasRedeemedRecruitingAccess({ ...options, assignmentId: assignmentContextId })) {
    return "recruiting";
  }

  const assignmentMode = await getAssignmentPlatformMode(assignmentContextId, globalMode);
  if (assignmentMode) {
    return assignmentMode;
  }

  return globalMode;
}

export async function isAiAssistantEnabledForContext(
  options: PlatformModeContextOptions = {}
): Promise<boolean> {
  const effectiveMode = await getEffectivePlatformMode(options);
  if (getPlatformModePolicy(effectiveMode).restrictAiByDefault) {
    return false;
  }

  const settings = await getSystemSettings();
  return settings?.aiAssistantEnabled ?? true;
}

import { and, eq } from "drizzle-orm";
import type { AiAssistantPolicy, PlatformMode } from "@/types";
import { db } from "@/lib/db";
import { assignments, recruitingInvitations } from "@/lib/db/schema";
import { rawQueryOne } from "@/lib/db/queries";
import { CONTEST_ACCESS_TOKEN_VALIDITY_SQL } from "@/lib/assignments/contest-access-tokens";
import { getEffectiveModeRestrictions, getResolvedPlatformMode, getSystemSettings } from "@/lib/system-settings";

export type PlatformModeContextOptions = {
  userId?: string | null;
  assignmentId?: string | null;
  problemId?: string | null;
  /**
   * Caller's role. When the caller is an instructor/admin/super_admin (i.e.
   * holds `submissions.view_all`), they bypass the platform-mode AI restriction
   * so staff can use the assistant during a contest/exam without being treated
   * as a participant.
   */
  userRole?: string | null;
};

export type ResolvedPlatformModeAssignmentContext = {
  assignmentId: string | null;
  mismatch:
    | {
        providedAssignmentId: string;
        resolvedAssignmentId: string;
        reason: "problem_scope" | "active_restricted_scope";
      }
    | null;
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

type AssignmentPlatformContext = {
  mode: PlatformMode;
  aiAssistantPolicy: AiAssistantPolicy;
};

async function getAssignmentPlatformMode(
  assignmentId: string | null | undefined,
  globalMode: PlatformMode
): Promise<AssignmentPlatformContext | null> {
  if (!assignmentId) return null;

  // The single assignment fetch surfaces both the exam mode (drives the
  // effective platform mode) and the per-contest AI override, so the assistant
  // gate never needs a second round-trip for the same assignment.
  const assignment = await db.query.assignments.findFirst({
    where: eq(assignments.id, assignmentId),
    columns: { examMode: true, aiAssistantPolicy: true },
  });

  if (!assignment || assignment.examMode === "none") {
    return null;
  }

  return {
    mode: globalMode === "exam" ? "exam" : "contest",
    aiAssistantPolicy: assignment.aiAssistantPolicy ?? "inherit",
  };
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
             AND ${CONTEST_ACCESS_TOKEN_VALIDITY_SQL}
         )
       )
     ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC, a.id ASC
     LIMIT 1`,
    { problemId, userId }
  );

  return row?.assignmentId ?? null;
}

async function findAccessibleAssignmentIdForProblem(
  userId: string,
  problemId: string,
  assignmentId: string
): Promise<string | null> {
  const row = await rawQueryOne<AssignmentContextRow>(
    `SELECT a.id AS "assignmentId"
     FROM assignments a
     INNER JOIN assignment_problems ap ON ap.assignment_id = a.id
     WHERE a.id = @assignmentId
       AND ap.problem_id = @problemId
       AND (
         EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.group_id = a.group_id AND e.user_id = @userId
         )
         OR EXISTS (
           SELECT 1 FROM contest_access_tokens cat
           WHERE cat.assignment_id = a.id AND cat.user_id = @userId
             AND ${CONTEST_ACCESS_TOKEN_VALIDITY_SQL}
         )
       )
     LIMIT 1`,
    { assignmentId, problemId, userId }
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
             AND ${CONTEST_ACCESS_TOKEN_VALIDITY_SQL}
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
     ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC, a.id ASC
     LIMIT 1`,
    { userId }
  );

  return row?.assignmentId ?? null;
}

export async function resolvePlatformModeAssignmentContext(
  options: PlatformModeContextOptions = {}
): Promise<string | null> {
  return (await resolvePlatformModeAssignmentContextDetails(options)).assignmentId;
}

export async function resolvePlatformModeAssignmentContextDetails(
  options: PlatformModeContextOptions = {}
): Promise<ResolvedPlatformModeAssignmentContext> {
  const providedAssignmentId = options.assignmentId ?? null;
  if (!options.userId) {
    return { assignmentId: providedAssignmentId, mismatch: null };
  }

  let problemScopeMismatch: ResolvedPlatformModeAssignmentContext["mismatch"] = null;

  if (options.problemId) {
    const [accessibleProvidedAssignmentId, restrictedProblemAssignmentId] = await Promise.all([
      providedAssignmentId
        ? findAccessibleAssignmentIdForProblem(
            options.userId,
            options.problemId,
            providedAssignmentId
          )
        : Promise.resolve<string | null>(null),
      findRestrictedAssignmentIdForProblem(options.userId, options.problemId),
    ]);

    if (restrictedProblemAssignmentId) {
      return {
        assignmentId: restrictedProblemAssignmentId,
        mismatch:
          providedAssignmentId && providedAssignmentId !== restrictedProblemAssignmentId
            ? {
                providedAssignmentId,
                resolvedAssignmentId: restrictedProblemAssignmentId,
                reason: "problem_scope",
              }
            : null,
      };
    }

    if (providedAssignmentId && !accessibleProvidedAssignmentId) {
      problemScopeMismatch = {
        providedAssignmentId,
        resolvedAssignmentId: providedAssignmentId,
        reason: "problem_scope",
      };
    }
  }

  const activeRestrictedAssignmentId = await findActiveRestrictedAssignmentIdForUser(options.userId);
  if (activeRestrictedAssignmentId) {
    return {
      assignmentId: activeRestrictedAssignmentId,
      mismatch:
        providedAssignmentId && providedAssignmentId !== activeRestrictedAssignmentId
          ? {
              providedAssignmentId,
              resolvedAssignmentId: activeRestrictedAssignmentId,
              reason: "active_restricted_scope",
            }
          : null,
    };
  }

  return {
    assignmentId: problemScopeMismatch ? null : providedAssignmentId,
    mismatch: problemScopeMismatch,
  };
}

export type EffectivePlatformModeContext = {
  mode: PlatformMode;
  /**
   * Per-contest AI override of the active restricted assignment in scope, or
   * "inherit" when there is none (or the resolved assignment is not a
   * contest/exam). Surfaced here so isAiAssistantEnabledForContext can apply a
   * contest-level allow/forbid from the same resolve + fetch this function
   * already performs, without a second DB round-trip.
   */
  aiAssistantPolicy: AiAssistantPolicy;
};

export async function getEffectivePlatformModeContext(
  options: PlatformModeContextOptions = {}
): Promise<EffectivePlatformModeContext> {
  const assignmentContextId = await resolvePlatformModeAssignmentContext(options);
  const globalMode = await getResolvedPlatformMode();

  // Read the resolved contest's row once. Its AI override applies to the
  // contest's participants regardless of which mode wins below (a forbid/allow
  // contest still overrides the assistant gate even under recruiting mode).
  const assignmentContext = await getAssignmentPlatformMode(assignmentContextId, globalMode);
  const aiAssistantPolicy = assignmentContext?.aiAssistantPolicy ?? "inherit";

  if (globalMode === "recruiting") {
    return { mode: "recruiting", aiAssistantPolicy };
  }

  if (await hasRedeemedRecruitingAccess({ ...options, assignmentId: assignmentContextId })) {
    return { mode: "recruiting", aiAssistantPolicy };
  }

  if (assignmentContext) {
    return { mode: assignmentContext.mode, aiAssistantPolicy };
  }

  return { mode: globalMode, aiAssistantPolicy };
}

export async function getEffectivePlatformMode(
  options: PlatformModeContextOptions = {}
): Promise<PlatformMode> {
  return (await getEffectivePlatformModeContext(options)).mode;
}

export async function isAiAssistantEnabledForContext(
  options: PlatformModeContextOptions = {}
): Promise<boolean> {
  // Staff with broad submission access (instructor/admin/super_admin) bypass
  // the contest/exam-mode AI gate. The restriction targets participants who
  // shouldn't get AI help during a graded session; staff need the assistant
  // to investigate submissions and run reviews regardless of platform mode.
  if (options.userRole) {
    const { resolveCapabilities } = await import("@/lib/capabilities/cache");
    const caps = await resolveCapabilities(options.userRole);
    if (caps.has("submissions.view_all")) {
      const settings = await getSystemSettings();
      return settings?.aiAssistantEnabled ?? true;
    }
  }

  const settings = await getSystemSettings();
  const { mode: effectiveMode, aiAssistantPolicy } = await getEffectivePlatformModeContext(options);

  // Per-contest override (participants only — staff already returned above). A
  // contest can force the assistant on/off for its participants, overriding the
  // global restricted-mode default. Both branches still honour the master
  // aiAssistantEnabled kill switch; "inherit" (or no contest in scope) falls
  // through to the mode restriction below unchanged.
  if (aiAssistantPolicy === "forbid") {
    return false;
  }
  if (aiAssistantPolicy === "allow") {
    return settings?.aiAssistantEnabled ?? true;
  }

  // Restricted modes force AI off unless the admin opted out via
  // allowAiAssistantInRestrictedModes. The override rule lives in ONE place
  // (getEffectiveModeRestrictions) so this cannot drift from the
  // system-settings resolution path; the settings record is fetched once and
  // passed through.
  const { restrictAiByDefault } = await getEffectiveModeRestrictions(effectiveMode, settings);
  if (restrictAiByDefault) {
    return false;
  }
  return settings?.aiAssistantEnabled ?? true;
}

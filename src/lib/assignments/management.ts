import { and, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";

import {
  assignmentProblems,
  assignments,
  examSessions,
  groupInstructors,
  groups,
  problemGroupAccess,
  problems,
  submissions,
} from "@/lib/db/schema";
import { syncGroupAccessRows } from "@/lib/problem-sets/management";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import type { AssignmentMutationInput } from "@/lib/validators/assignments";

type AssignmentManagerProblem = {
  id: string;
  title: string;
  authorId: string | null;
  visibility: string | null;
};

export function canManageGroupResources(
  groupInstructorId: string | null,
  userId: string
) {
  return groupInstructorId === userId;
}

async function getGroupInstructorAssignmentRole(
  groupId: string,
  userId: string
): Promise<string | null> {
  const [row] = await db
    .select({ role: groupInstructors.role })
    .from(groupInstructors)
    .where(and(eq(groupInstructors.groupId, groupId), eq(groupInstructors.userId, userId)))
    .limit(1);

  return row?.role ?? null;
}

export async function getAssignedTeachingGroupIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .leftJoin(
      groupInstructors,
      and(
        eq(groupInstructors.groupId, groups.id),
        eq(groupInstructors.userId, userId)
      )
    )
    .where(
      or(
        eq(groups.instructorId, userId),
        eq(groupInstructors.userId, userId)
      )
    );

  return Array.from(new Set(rows.map((row) => row.id)));
}

/**
 * Async version that supports custom roles via capability check
 * and co-instructor / TA group roles.
 */
export async function canManageGroupResourcesAsync(
  groupInstructorId: string | null,
  userId: string,
  role: string,
  groupId?: string
): Promise<boolean> {
  if (canManageGroupResources(groupInstructorId, userId)) return true;
  const caps = await resolveCapabilities(role);
  if (caps.has("groups.view_all")) return true;
  if (groupId) {
    const assignedRole = await getGroupInstructorAssignmentRole(groupId, userId);
    if (assignedRole === "co_instructor") return true;
  }
  return false;
}

/**
 * Narrower helper for group member management. Owners, co-instructors, and
 * global group managers can always manage memberships. TAs may do so only
 * when their role also carries the explicit groups.manage_members capability.
 */
export async function canManageGroupMembersAsync(
  groupInstructorId: string | null,
  userId: string,
  role: string,
  groupId?: string
): Promise<boolean> {
  if (await canManageGroupResourcesAsync(groupInstructorId, userId, role, groupId)) {
    return true;
  }

  if (!groupId) {
    return false;
  }

  const caps = await resolveCapabilities(role);
  if (!caps.has("groups.manage_members")) {
    return false;
  }

  return isGroupTA(groupId, userId);
}

/**
 * Check if a user is a TA (not co-instructor) for a group.
 * TAs have limited permissions (view submissions, add comments) but
 * cannot delete problems or modify system settings.
 */
export async function isGroupTA(groupId: string, userId: string): Promise<boolean> {
  return (await getGroupInstructorAssignmentRole(groupId, userId)) === "ta";
}

/**
 * Check if a user has any instructor-level role in a group
 * (owner, co-instructor, or TA).
 */
export async function hasGroupInstructorRole(groupId: string, userId: string, groupOwnerId: string | null): Promise<boolean> {
  if (groupOwnerId === userId) return true;
  return (await getGroupInstructorAssignmentRole(groupId, userId)) !== null;
}

export async function getManageableProblemsForGroup(
  groupId: string,
  userId: string,
  role: string
): Promise<AssignmentManagerProblem[]> {
  const caps = await resolveCapabilities(role);
  if (caps.has("problems.view_all")) {
    return db
      .select({
        id: problems.id,
        title: problems.title,
        authorId: problems.authorId,
        visibility: problems.visibility,
      })
      .from(problems);
  }

  return db
    .selectDistinct({
      id: problems.id,
      title: problems.title,
      authorId: problems.authorId,
      visibility: problems.visibility,
    })
    .from(problems)
    .leftJoin(
      problemGroupAccess,
      and(eq(problemGroupAccess.problemId, problems.id), eq(problemGroupAccess.groupId, groupId))
    )
    .where(
      or(
        eq(problems.authorId, userId),
        eq(problems.visibility, "public"),
        eq(problemGroupAccess.groupId, groupId)
      )
    );
}

function mapAssignmentProblems(
  assignmentId: string,
  values: AssignmentMutationInput["problems"]
) {
  return values.map((problem, index) => ({
    id: nanoid(),
    assignmentId,
    problemId: problem.problemId,
    points: problem.points,
    sortOrder: index,
  }));
}

export async function createAssignmentWithProblems(
  groupId: string,
  input: AssignmentMutationInput
) {
  const id = nanoid();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(assignments)
      .values({
        id,
        groupId,
        title: input.title,
        description: input.description ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        lateDeadline: input.lateDeadline ? new Date(input.lateDeadline) : null,
        latePenalty: input.latePenalty,
        examMode: input.examMode ?? "none",
        visibility: input.visibility ?? "private",
        examDurationMinutes: input.examDurationMinutes ?? null,
        scoringModel: input.scoringModel ?? "ioi",
        freezeLeaderboardAt: input.freezeLeaderboardAt ? new Date(input.freezeLeaderboardAt) : null,
        enableAntiCheat: input.enableAntiCheat ?? false,
        showResultsToCandidate: input.showResultsToCandidate ?? false,
        hideScoresFromCandidates: input.hideScoresFromCandidates ?? false,
        createdAt: now,
        updatedAt: now,
      });

    await tx.insert(assignmentProblems).values(mapAssignmentProblems(id, input.problems));
    await syncGroupAccessRows(groupId);
  });
  return id;
}

export async function updateAssignmentWithProblems(
  assignmentId: string,
  input: AssignmentMutationInput,
  options: {
    problemLinksChanged?: boolean;
    allowLockedProblemChanges?: boolean;
  } = {}
) {
  const now = new Date();
  const { problemLinksChanged = false, allowLockedProblemChanges = false } = options;

  await db.transaction(async (tx) => {
    const [assignment] = await tx
      .select({
        groupId: assignments.groupId,
        examMode: assignments.examMode,
        startsAt: assignments.startsAt,
        deadline: assignments.deadline,
        examDurationMinutes: assignments.examDurationMinutes,
      })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    if (problemLinksChanged && !allowLockedProblemChanges) {
      const [submissionRow] = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.assignmentId, assignmentId))
        .limit(1);

      if (submissionRow) {
        throw new Error("assignmentProblemsLocked");
      }
    }

    if (assignment.examMode === "windowed") {
      const [existingSession] = await tx
        .select({ id: examSessions.id })
        .from(examSessions)
        .where(eq(examSessions.assignmentId, assignmentId))
        .limit(1);

      if (existingSession) {
        if (input.examMode !== "windowed") {
          throw new Error("examModeChangeBlocked");
        }
        // Block timing changes that affect existing sessions
        const inputStartsAt = input.startsAt ? new Date(input.startsAt).getTime() : null;
        const inputDeadline = input.deadline ? new Date(input.deadline).getTime() : null;
        const currentStartsAt = assignment.startsAt?.getTime() ?? null;
        const currentDeadline = assignment.deadline?.getTime() ?? null;
        if (
          inputStartsAt !== currentStartsAt ||
          inputDeadline !== currentDeadline ||
          (input.examDurationMinutes ?? null) !== (assignment.examDurationMinutes ?? null)
        ) {
          throw new Error("examTimingChangeBlocked");
        }
      }
    }

    await tx.update(assignments)
      .set({
        title: input.title,
        description: input.description ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        lateDeadline: input.lateDeadline ? new Date(input.lateDeadline) : null,
        latePenalty: input.latePenalty,
        examMode: input.examMode ?? "none",
        visibility: input.visibility ?? "private",
        examDurationMinutes: input.examDurationMinutes ?? null,
        scoringModel: input.scoringModel ?? "ioi",
        freezeLeaderboardAt: input.freezeLeaderboardAt ? new Date(input.freezeLeaderboardAt) : null,
        enableAntiCheat: input.enableAntiCheat ?? false,
        showResultsToCandidate: input.showResultsToCandidate ?? false,
        hideScoresFromCandidates: input.hideScoresFromCandidates ?? false,
        updatedAt: now,
      })
      .where(eq(assignments.id, assignmentId));

    await tx.delete(assignmentProblems).where(eq(assignmentProblems.assignmentId, assignmentId));
    await tx.insert(assignmentProblems)
      .values(mapAssignmentProblems(assignmentId, input.problems));

    await syncGroupAccessRows(assignment.groupId);
  });
}

export async function deleteAssignmentWithProblems(assignmentId: string) {
  await db.transaction(async (tx) => {
    const [assignment] = await tx
      .select({ groupId: assignments.groupId })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1);

    if (!assignment) {
      return;
    }

    const [submissionCountRow] = await tx
      .select({ total: sql<number>`count(${submissions.id})` })
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId));

    const submissionCount = submissionCountRow ?? { total: 0 };

    if (Number(submissionCount.total) > 0) {
      throw new Error("assignmentDeleteBlocked");
    }

    await tx.delete(assignmentProblems).where(eq(assignmentProblems.assignmentId, assignmentId));
    await tx.delete(assignments).where(eq(assignments.id, assignmentId));
    await syncGroupAccessRows(assignment.groupId);
  });
}

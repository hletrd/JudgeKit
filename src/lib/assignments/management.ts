import { and, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, sqlite } from "@/lib/db";
import {
  assignmentProblems,
  assignments,
  examSessions,
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
  userId: string,
  role: string
) {
  if (role === "super_admin" || role === "admin") return true;
  if (role === "instructor" && groupInstructorId === userId) return true;
  if (groupInstructorId === userId) return true;
  return false;
}

/**
 * Async version that supports custom roles via capability check.
 */
export async function canManageGroupResourcesAsync(
  groupInstructorId: string | null,
  userId: string,
  role: string
): Promise<boolean> {
  if (canManageGroupResources(groupInstructorId, userId, role)) return true;
  const caps = await resolveCapabilities(role);
  return caps.has("assignments.edit");
}

export async function getManageableProblemsForGroup(
  groupId: string,
  userId: string,
  role: string
): Promise<AssignmentManagerProblem[]> {
  if (role === "super_admin" || role === "admin") {
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

export function createAssignmentWithProblems(
  groupId: string,
  input: AssignmentMutationInput
) {
  const id = nanoid();
  const now = new Date();

  const execute = sqlite.transaction(() => {
    db.insert(assignments)
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
        examDurationMinutes: input.examDurationMinutes ?? null,
        scoringModel: input.scoringModel ?? "ioi",
        freezeLeaderboardAt: input.freezeLeaderboardAt ? new Date(input.freezeLeaderboardAt) : null,
        enableAntiCheat: input.enableAntiCheat ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(assignmentProblems).values(mapAssignmentProblems(id, input.problems)).run();
    syncGroupAccessRows(groupId);
  });

  execute();

  return id;
}

export function updateAssignmentWithProblems(
  assignmentId: string,
  input: AssignmentMutationInput
) {
  const now = new Date();

  const execute = sqlite.transaction(() => {
    const assignment = db
      .select({
        groupId: assignments.groupId,
        examMode: assignments.examMode,
        startsAt: assignments.startsAt,
        deadline: assignments.deadline,
        examDurationMinutes: assignments.examDurationMinutes,
      })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .get();

    if (!assignment) {
      throw new Error("Assignment not found");
    }

    if (assignment.examMode === "windowed") {
      const existingSession = db
        .select({ id: examSessions.id })
        .from(examSessions)
        .where(eq(examSessions.assignmentId, assignmentId))
        .limit(1)
        .get();

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

    db.update(assignments)
      .set({
        title: input.title,
        description: input.description ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        deadline: input.deadline ? new Date(input.deadline) : null,
        lateDeadline: input.lateDeadline ? new Date(input.lateDeadline) : null,
        latePenalty: input.latePenalty,
        examMode: input.examMode ?? "none",
        examDurationMinutes: input.examDurationMinutes ?? null,
        scoringModel: input.scoringModel ?? "ioi",
        freezeLeaderboardAt: input.freezeLeaderboardAt ? new Date(input.freezeLeaderboardAt) : null,
        enableAntiCheat: input.enableAntiCheat ?? false,
        updatedAt: now,
      })
      .where(eq(assignments.id, assignmentId))
      .run();

    db.delete(assignmentProblems).where(eq(assignmentProblems.assignmentId, assignmentId)).run();
    db.insert(assignmentProblems)
      .values(mapAssignmentProblems(assignmentId, input.problems))
      .run();

    syncGroupAccessRows(assignment.groupId);
  });

  execute();
}

export function deleteAssignmentWithProblems(assignmentId: string) {
  const execute = sqlite.transaction(() => {
    const assignment = db
      .select({ groupId: assignments.groupId })
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .get();

    if (!assignment) {
      return;
    }

    const submissionCountRow = db
      .select({ total: sql<number>`count(${submissions.id})` })
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId))
      .get() ?? { total: 0 };

    if (Number(submissionCountRow.total) > 0) {
      throw new Error("assignmentDeleteBlocked");
    }

    db.delete(assignmentProblems).where(eq(assignmentProblems.assignmentId, assignmentId)).run();
    db.delete(assignments).where(eq(assignments.id, assignmentId)).run();
    syncGroupAccessRows(assignment.groupId);
  });

  execute();
}

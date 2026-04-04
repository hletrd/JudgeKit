import { eq, inArray, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, execTransaction } from "@/lib/db";
import {
  problemSets,
  problemSetProblems,
  problemSetGroupAccess,
  problemGroupAccess,
  assignmentProblems,
  assignments,
} from "@/lib/db/schema";
import type { ProblemSetMutationInput } from "@/lib/validators/problem-sets";

function mapProblemSetProblems(problemSetId: string, problemIds: string[]) {
  return problemIds.map((problemId, index) => ({
    id: nanoid(),
    problemSetId,
    problemId,
    sortOrder: index,
  }));
}

/**
 * Recompute problemGroupAccess rows for a group, considering both
 * assignment problems AND problem set problems.
 */
export function syncGroupAccessRows(groupId: string) {
  // 1. Collect problem IDs from assignments
  const assignmentRows = db
    .select({ problemId: assignmentProblems.problemId })
    .from(assignmentProblems)
    .innerJoin(assignments, eq(assignments.id, assignmentProblems.assignmentId))
    .where(eq(assignments.groupId, groupId))
    .all();

  // 2. Collect problem IDs from problem sets assigned to this group
  const problemSetRows = db
    .select({ problemId: problemSetProblems.problemId })
    .from(problemSetProblems)
    .innerJoin(
      problemSetGroupAccess,
      eq(problemSetGroupAccess.problemSetId, problemSetProblems.problemSetId)
    )
    .where(eq(problemSetGroupAccess.groupId, groupId))
    .all();

  const requiredProblemIds = new Set([
    ...assignmentRows.map((row) => row.problemId),
    ...problemSetRows.map((row) => row.problemId),
  ]);

  const existingRows = db
    .select({ id: problemGroupAccess.id, problemId: problemGroupAccess.problemId })
    .from(problemGroupAccess)
    .where(eq(problemGroupAccess.groupId, groupId))
    .all();

  const existingProblemIds = new Set(existingRows.map((row) => row.problemId));

  const rowsToInsert = [...requiredProblemIds]
    .filter((problemId) => !existingProblemIds.has(problemId))
    .map((problemId) => ({
      id: nanoid(),
      groupId,
      problemId,
    }));

  const idsToDelete = existingRows
    .filter((row) => !requiredProblemIds.has(row.problemId))
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    db.delete(problemGroupAccess).where(inArray(problemGroupAccess.id, idsToDelete)).run();
  }

  if (rowsToInsert.length > 0) {
    db.insert(problemGroupAccess).values(rowsToInsert).run();
  }
}

export function createProblemSet(input: ProblemSetMutationInput, createdBy: string) {
  const id = nanoid();
  const now = new Date();

  execTransaction(() => {
    db.insert(problemSets)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (input.problemIds.length > 0) {
      db.insert(problemSetProblems)
        .values(mapProblemSetProblems(id, input.problemIds))
        .run();
    }
  });
  return id;
}

export function updateProblemSet(problemSetId: string, input: ProblemSetMutationInput) {
  const now = new Date();

  execTransaction(() => {
    db.update(problemSets)
      .set({
        name: input.name,
        description: input.description ?? null,
        updatedAt: now,
      })
      .where(eq(problemSets.id, problemSetId))
      .run();

    // Replace all problems
    db.delete(problemSetProblems)
      .where(eq(problemSetProblems.problemSetId, problemSetId))
      .run();

    if (input.problemIds.length > 0) {
      db.insert(problemSetProblems)
        .values(mapProblemSetProblems(problemSetId, input.problemIds))
        .run();
    }

    // Re-sync group access for all groups that have this problem set
    const affectedGroups = db
      .select({ groupId: problemSetGroupAccess.groupId })
      .from(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId))
      .all();

    for (const { groupId } of affectedGroups) {
      syncGroupAccessRows(groupId);
    }
  });
}

export function deleteProblemSet(problemSetId: string) {
  execTransaction(() => {
    // Find affected groups before deleting
    const affectedGroups = db
      .select({ groupId: problemSetGroupAccess.groupId })
      .from(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId))
      .all();

    db.delete(problemSetProblems)
      .where(eq(problemSetProblems.problemSetId, problemSetId))
      .run();
    db.delete(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId))
      .run();
    db.delete(problemSets)
      .where(eq(problemSets.id, problemSetId))
      .run();

    // Re-sync access for affected groups
    for (const { groupId } of affectedGroups) {
      syncGroupAccessRows(groupId);
    }
  });
}

export function assignProblemSetToGroups(problemSetId: string, groupIds: string[]) {
  const now = new Date();

  execTransaction(() => {
    // Get existing assignments to avoid duplicates
    const existing = db
      .select({ groupId: problemSetGroupAccess.groupId })
      .from(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId))
      .all();

    const existingGroupIds = new Set(existing.map((row) => row.groupId));
    const newGroupIds = groupIds.filter((id) => !existingGroupIds.has(id));

    if (newGroupIds.length > 0) {
      db.insert(problemSetGroupAccess)
        .values(
          newGroupIds.map((groupId) => ({
            id: nanoid(),
            problemSetId,
            groupId,
            assignedAt: now,
          }))
        )
        .run();

      // Sync access for newly assigned groups
      for (const groupId of newGroupIds) {
        syncGroupAccessRows(groupId);
      }
    }
  });
}

export function removeProblemSetFromGroup(problemSetId: string, groupId: string) {
  execTransaction(() => {
    db.delete(problemSetGroupAccess)
      .where(
        and(
          eq(problemSetGroupAccess.problemSetId, problemSetId),
          eq(problemSetGroupAccess.groupId, groupId)
        )
      )
      .run();

    syncGroupAccessRows(groupId);
  });
}

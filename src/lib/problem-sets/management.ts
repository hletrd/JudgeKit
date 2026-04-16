import { eq, inArray, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, execTransaction, type TransactionClient } from "@/lib/db";
import {
  problemSets,
  problemSetProblems,
  problemSetGroupAccess,
  problemGroupAccess,
  assignmentProblems,
  assignments,
} from "@/lib/db/schema";
import type { ProblemSetMutationInput } from "@/lib/validators/problem-sets";

type DatabaseExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

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
export async function syncGroupAccessRows(
  groupId: string,
  executor: DatabaseExecutor | TransactionClient = db
) {
  // 1. Collect problem IDs from assignments
  const assignmentRows = await executor
    .select({ problemId: assignmentProblems.problemId })
    .from(assignmentProblems)
    .innerJoin(assignments, eq(assignments.id, assignmentProblems.assignmentId))
    .where(eq(assignments.groupId, groupId));

  // 2. Collect problem IDs from problem sets assigned to this group
  const problemSetRows = await executor
    .select({ problemId: problemSetProblems.problemId })
    .from(problemSetProblems)
    .innerJoin(
      problemSetGroupAccess,
      eq(problemSetGroupAccess.problemSetId, problemSetProblems.problemSetId)
    )
    .where(eq(problemSetGroupAccess.groupId, groupId));

  const requiredProblemIds = new Set([
    ...assignmentRows.map((row) => row.problemId),
    ...problemSetRows.map((row) => row.problemId),
  ]);

  const existingRows = await executor
    .select({ id: problemGroupAccess.id, problemId: problemGroupAccess.problemId })
    .from(problemGroupAccess)
    .where(eq(problemGroupAccess.groupId, groupId));

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
    await executor.delete(problemGroupAccess).where(inArray(problemGroupAccess.id, idsToDelete));
  }

  if (rowsToInsert.length > 0) {
    await executor.insert(problemGroupAccess).values(rowsToInsert);
  }
}

export async function createProblemSet(input: ProblemSetMutationInput, createdBy: string) {
  const id = nanoid();
  const now = new Date();

  await execTransaction(async (tx) => {
    await tx.insert(problemSets)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        isPublic: input.isPublic ?? false,
        createdBy,
        createdAt: now,
        updatedAt: now,
      });

    if (input.problemIds.length > 0) {
      await tx.insert(problemSetProblems)
        .values(mapProblemSetProblems(id, input.problemIds));
    }
  });
  return id;
}

export async function updateProblemSet(problemSetId: string, input: ProblemSetMutationInput) {
  const now = new Date();

  await execTransaction(async (tx) => {
    await tx.update(problemSets)
      .set({
        name: input.name,
        description: input.description ?? null,
        isPublic: input.isPublic ?? false,
        updatedAt: now,
      })
      .where(eq(problemSets.id, problemSetId));

    // Replace all problems
    await tx.delete(problemSetProblems)
      .where(eq(problemSetProblems.problemSetId, problemSetId));

    if (input.problemIds.length > 0) {
      await tx.insert(problemSetProblems)
        .values(mapProblemSetProblems(problemSetId, input.problemIds));
    }

    // Re-sync group access for all groups that have this problem set
    const affectedGroups = await tx
      .select({ groupId: problemSetGroupAccess.groupId })
      .from(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId));

    for (const { groupId } of affectedGroups) {
      await syncGroupAccessRows(groupId, tx);
    }
  });
}

export async function deleteProblemSet(problemSetId: string) {
  await execTransaction(async (tx) => {
    // Find affected groups before deleting
    const affectedGroups = await tx
      .select({ groupId: problemSetGroupAccess.groupId })
      .from(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId));

    await tx.delete(problemSetProblems)
      .where(eq(problemSetProblems.problemSetId, problemSetId));
    await tx.delete(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId));
    await tx.delete(problemSets)
      .where(eq(problemSets.id, problemSetId));

    // Re-sync access for affected groups
    for (const { groupId } of affectedGroups) {
      await syncGroupAccessRows(groupId, tx);
    }
  });
}

export async function assignProblemSetToGroups(problemSetId: string, groupIds: string[]) {
  const now = new Date();

  await execTransaction(async (tx) => {
    // Get existing assignments to avoid duplicates
    const existing = await tx
      .select({ groupId: problemSetGroupAccess.groupId })
      .from(problemSetGroupAccess)
      .where(eq(problemSetGroupAccess.problemSetId, problemSetId));

    const existingGroupIds = new Set(existing.map((row) => row.groupId));
    const newGroupIds = groupIds.filter((id) => !existingGroupIds.has(id));

    if (newGroupIds.length > 0) {
      await tx.insert(problemSetGroupAccess)
        .values(
          newGroupIds.map((groupId) => ({
            id: nanoid(),
            problemSetId,
            groupId,
            assignedAt: now,
          }))
        );

      // Sync access for newly assigned groups
      for (const groupId of newGroupIds) {
        await syncGroupAccessRows(groupId, tx);
      }
    }
  });
}

export async function removeProblemSetFromGroup(problemSetId: string, groupId: string) {
  await execTransaction(async (tx) => {
    await tx.delete(problemSetGroupAccess)
      .where(
        and(
          eq(problemSetGroupAccess.problemSetId, problemSetId),
          eq(problemSetGroupAccess.groupId, groupId)
        )
      );

    await syncGroupAccessRows(groupId, tx);
  });
}

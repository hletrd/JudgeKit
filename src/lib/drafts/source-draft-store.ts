/**
 * Server-side source-draft store.
 *
 * Persists a user's in-progress editor code so unsubmitted work survives a
 * device crash / browser switch (the client previously kept drafts only in
 * localStorage). One row per (user, problem, language, scope), upserted as the
 * editor autosaves; read back to rehydrate the editor.
 *
 * The scope is the contest the draft was written in (assignmentId), or null for
 * the shared practice draft. Reads never cross scopes, so code autosaved outside
 * a contest is not restored into that contest's editor (and vice versa).
 *
 * This is distinct from code_snapshots, which is append-only anti-cheat
 * telemetry and is never read back into the editor.
 */
import { db } from "@/lib/db";
import { sourceDrafts } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDbNowUncached } from "@/lib/db-time";

export interface SourceDraftRecord {
  language: string;
  sourceCode: string;
  updatedAt: Date;
}

function scopeCondition(assignmentId: string | null) {
  return assignmentId ? eq(sourceDrafts.assignmentId, assignmentId) : isNull(sourceDrafts.assignmentId);
}

/** Upsert the draft for (user, problem, language) within a scope. */
export async function upsertSourceDraft(params: {
  userId: string;
  problemId: string;
  language: string;
  sourceCode: string;
  assignmentId: string | null;
}): Promise<void> {
  const now = await getDbNowUncached();
  // Each scope has its own partial unique index (see schema.pg.ts), so the
  // conflict target has to name the matching one.
  const conflictTarget = params.assignmentId
    ? {
        target: [sourceDrafts.userId, sourceDrafts.problemId, sourceDrafts.language, sourceDrafts.assignmentId],
        targetWhere: sql`${sourceDrafts.assignmentId} is not null`,
      }
    : {
        target: [sourceDrafts.userId, sourceDrafts.problemId, sourceDrafts.language],
        targetWhere: sql`${sourceDrafts.assignmentId} is null`,
      };
  await db
    .insert(sourceDrafts)
    .values({
      userId: params.userId,
      problemId: params.problemId,
      language: params.language,
      assignmentId: params.assignmentId,
      sourceCode: params.sourceCode,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      ...conflictTarget,
      set: { sourceCode: params.sourceCode, updatedAt: now },
    });
}

/** A user's saved drafts for a problem within a scope (one per language). */
export async function getSourceDraftsForProblem(
  userId: string,
  problemId: string,
  assignmentId: string | null
): Promise<SourceDraftRecord[]> {
  return db
    .select({
      language: sourceDrafts.language,
      sourceCode: sourceDrafts.sourceCode,
      updatedAt: sourceDrafts.updatedAt,
    })
    .from(sourceDrafts)
    .where(
      and(
        eq(sourceDrafts.userId, userId),
        eq(sourceDrafts.problemId, problemId),
        scopeCondition(assignmentId)
      )
    );
}

/** Remove a single (user, problem, language) draft in a scope — e.g. after a successful submission. */
export async function deleteSourceDraft(params: {
  userId: string;
  problemId: string;
  language: string;
  assignmentId: string | null;
}): Promise<void> {
  await db
    .delete(sourceDrafts)
    .where(
      and(
        eq(sourceDrafts.userId, params.userId),
        eq(sourceDrafts.problemId, params.problemId),
        eq(sourceDrafts.language, params.language),
        scopeCondition(params.assignmentId)
      )
    );
}

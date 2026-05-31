/**
 * Server-side source-draft store.
 *
 * Persists a user's in-progress editor code so unsubmitted work survives a
 * device crash / browser switch (the client previously kept drafts only in
 * localStorage). One row per (user, problem, language), upserted as the editor
 * autosaves; read back to rehydrate the editor.
 *
 * This is distinct from code_snapshots, which is append-only anti-cheat
 * telemetry and is never read back into the editor.
 */
import { db } from "@/lib/db";
import { sourceDrafts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getDbNowUncached } from "@/lib/db-time";

export interface SourceDraftRecord {
  language: string;
  sourceCode: string;
  updatedAt: Date;
}

/** Upsert the draft for (user, problem, language). */
export async function upsertSourceDraft(params: {
  userId: string;
  problemId: string;
  language: string;
  sourceCode: string;
}): Promise<void> {
  const now = await getDbNowUncached();
  await db
    .insert(sourceDrafts)
    .values({
      userId: params.userId,
      problemId: params.problemId,
      language: params.language,
      sourceCode: params.sourceCode,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sourceDrafts.userId, sourceDrafts.problemId, sourceDrafts.language],
      set: { sourceCode: params.sourceCode, updatedAt: now },
    });
}

/** All of a user's saved drafts for a problem (one per language). */
export async function getSourceDraftsForProblem(
  userId: string,
  problemId: string
): Promise<SourceDraftRecord[]> {
  return db
    .select({
      language: sourceDrafts.language,
      sourceCode: sourceDrafts.sourceCode,
      updatedAt: sourceDrafts.updatedAt,
    })
    .from(sourceDrafts)
    .where(and(eq(sourceDrafts.userId, userId), eq(sourceDrafts.problemId, problemId)));
}

/** Remove a single (user, problem, language) draft — e.g. after a successful submission. */
export async function deleteSourceDraft(params: {
  userId: string;
  problemId: string;
  language: string;
}): Promise<void> {
  await db
    .delete(sourceDrafts)
    .where(
      and(
        eq(sourceDrafts.userId, params.userId),
        eq(sourceDrafts.problemId, params.problemId),
        eq(sourceDrafts.language, params.language)
      )
    );
}

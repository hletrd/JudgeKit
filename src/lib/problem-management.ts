import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, execTransaction } from "@/lib/db";
import { problems, testCases, tags, problemTags } from "@/lib/db/schema";
import type { ProblemMutationInput } from "@/lib/validators/problem-management";
import { sanitizeHtml } from "@/lib/security/sanitize-html";

function mapTestCases(problemId: string, values: ProblemMutationInput["testCases"]) {
  return values.map((testCase, index) => ({
    id: nanoid(),
    problemId,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    isVisible: testCase.isVisible,
    sortOrder: index,
  }));
}

/**
 * Resolve tag names to tag IDs, creating any that don't exist yet.
 * Returns an array of tag IDs.
 */
function resolveTagIds(tagNames: string[], createdBy: string): string[] {
  const tagIds: string[] = [];
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const existing = db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, trimmed))
      .get();
    if (existing) {
      tagIds.push(existing.id);
    } else {
      const newId = nanoid();
      db.insert(tags)
        .values({ id: newId, name: trimmed, createdBy, createdAt: new Date() })
        .run();
      tagIds.push(newId);
    }
  }
  return tagIds;
}

function syncProblemTags(problemId: string, tagIds: string[]) {
  db.delete(problemTags).where(eq(problemTags.problemId, problemId)).run();
  for (const tagId of tagIds) {
    db.insert(problemTags)
      .values({ id: nanoid(), problemId, tagId })
      .run();
  }
}

export function createProblemWithTestCases(input: ProblemMutationInput, authorId: string) {
  const id = nanoid();
  const now = new Date();

  execTransaction(() => {
    db.insert(problems)
      .values({
        id,
        sequenceNumber: input.sequenceNumber ?? null,
        title: input.title,
        description: sanitizeHtml(input.description),
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
        visibility: input.visibility,
        showCompileOutput: input.showCompileOutput,
        showDetailedResults: input.showDetailedResults,
        showRuntimeErrors: input.showRuntimeErrors,
        allowAiAssistant: input.allowAiAssistant,
        comparisonMode: input.comparisonMode,
        floatAbsoluteError: input.floatAbsoluteError ?? null,
        floatRelativeError: input.floatRelativeError ?? null,
        difficulty: input.difficulty ?? null,
        authorId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const mappedTestCases = mapTestCases(id, input.testCases);
    if (mappedTestCases.length > 0) {
      db.insert(testCases).values(mappedTestCases).run();
    }

    if (input.tags.length > 0) {
      const tagIds = resolveTagIds(input.tags, authorId);
      syncProblemTags(id, tagIds);
    }

  });

  return id;
}

export function updateProblemWithTestCases(problemId: string, input: ProblemMutationInput, actorId?: string) {
  const now = new Date();

  execTransaction(() => {
    db.update(problems)
      .set({
        sequenceNumber: input.sequenceNumber ?? null,
        title: input.title,
        description: sanitizeHtml(input.description),
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
        visibility: input.visibility,
        showCompileOutput: input.showCompileOutput,
        showDetailedResults: input.showDetailedResults,
        showRuntimeErrors: input.showRuntimeErrors,
        allowAiAssistant: input.allowAiAssistant,
        comparisonMode: input.comparisonMode,
        floatAbsoluteError: input.floatAbsoluteError ?? null,
        floatRelativeError: input.floatRelativeError ?? null,
        difficulty: input.difficulty ?? null,
        updatedAt: now,
      })
      .where(eq(problems.id, problemId))
      .run();

    db.delete(testCases).where(eq(testCases.problemId, problemId)).run();

    const mappedTestCases = mapTestCases(problemId, input.testCases);
    if (mappedTestCases.length > 0) {
      db.insert(testCases).values(mappedTestCases).run();
    }

    const tagIds = resolveTagIds(input.tags, actorId ?? "");
    syncProblemTags(problemId, tagIds);

  });
}

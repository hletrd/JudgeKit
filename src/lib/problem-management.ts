import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, execTransaction, type TransactionClient } from "@/lib/db";
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

type DatabaseExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

async function resolveTagIdsWithExecutor(
  tagNames: string[],
  createdBy: string,
  executor: DatabaseExecutor | TransactionClient
): Promise<string[]> {
  const tagIds: string[] = [];
  for (const name of tagNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const [existing] = await executor
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, trimmed))
      .limit(1);
    if (existing) {
      tagIds.push(existing.id);
    } else {
      const newId = nanoid();
      await executor.insert(tags)
        .values({ id: newId, name: trimmed, createdBy, createdAt: new Date() });
      tagIds.push(newId);
    }
  }
  return tagIds;
}

async function syncProblemTags(
  problemId: string,
  tagIds: string[],
  executor: DatabaseExecutor | TransactionClient = db
) {
  await executor.delete(problemTags).where(eq(problemTags.problemId, problemId));
  for (const tagId of tagIds) {
    await executor.insert(problemTags)
      .values({ id: nanoid(), problemId, tagId });
  }
}

export async function createProblemWithTestCases(input: ProblemMutationInput, authorId: string) {
  const id = nanoid();
  const now = new Date();

  await execTransaction(async (tx) => {
    await tx.insert(problems)
      .values({
        id,
        sequenceNumber: input.sequenceNumber ?? null,
        title: input.title,
        description: sanitizeHtml(input.description),
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
        problemType: input.problemType,
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
      });

    const mappedTestCases = mapTestCases(id, input.testCases);
    if (mappedTestCases.length > 0) {
      await tx.insert(testCases).values(mappedTestCases);
    }

    if (input.tags.length > 0) {
      const tagIds = await resolveTagIdsWithExecutor(input.tags, authorId, tx);
      await syncProblemTags(id, tagIds, tx);
    }

  });

  return id;
}

export async function updateProblemWithTestCases(problemId: string, input: ProblemMutationInput, actorId?: string) {
  const now = new Date();

  await execTransaction(async (tx) => {
    await tx.update(problems)
      .set({
        sequenceNumber: input.sequenceNumber ?? null,
        title: input.title,
        description: sanitizeHtml(input.description),
        timeLimitMs: input.timeLimitMs,
        memoryLimitMb: input.memoryLimitMb,
        problemType: input.problemType,
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
      .where(eq(problems.id, problemId));

    await tx.delete(testCases).where(eq(testCases.problemId, problemId));

    const mappedTestCases = mapTestCases(problemId, input.testCases);
    if (mappedTestCases.length > 0) {
      await tx.insert(testCases).values(mappedTestCases);
    }

    const tagIds = await resolveTagIdsWithExecutor(input.tags, actorId ?? "", tx);
    await syncProblemTags(problemId, tagIds, tx);

  });
}

import { asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, execTransaction, type TransactionClient } from "@/lib/db";
import { problems, testCases, tags, problemTags, files } from "@/lib/db/schema";
import { extractLinkedFileIds } from "@/lib/files/problem-links";
import type { ProblemMutationInput } from "@/lib/validators/problem-management";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";

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

type ExistingTestCaseRow = {
  id: string;
  input: string;
  expectedOutput: string;
  isVisible: boolean | null;
  sortOrder: number | null;
};

type PlannedTestCaseRow = ProblemMutationInput["testCases"][number] & {
  id: string;
  problemId: string;
  sortOrder: number;
};

export function planProblemTestCaseSync(
  problemId: string,
  existingCases: ExistingTestCaseRow[],
  nextCases: ProblemMutationInput["testCases"]
) {
  const existingBySignature = new Map<string, ExistingTestCaseRow[]>();
  const matchedIds = new Set<string>();
  const updates: Array<{ id: string; sortOrder: number }> = [];
  const inserts: PlannedTestCaseRow[] = [];

  for (const existing of existingCases) {
    const signature = JSON.stringify([
      existing.input,
      existing.expectedOutput,
      Boolean(existing.isVisible),
    ]);
    const bucket = existingBySignature.get(signature) ?? [];
    bucket.push(existing);
    existingBySignature.set(signature, bucket);
  }

  for (const [index, testCase] of nextCases.entries()) {
    const signature = JSON.stringify([
      testCase.input,
      testCase.expectedOutput,
      Boolean(testCase.isVisible),
    ]);
    const bucket = existingBySignature.get(signature) ?? [];
    const match = bucket.find((existing) => !matchedIds.has(existing.id));

    if (match) {
      matchedIds.add(match.id);
      if ((match.sortOrder ?? 0) !== index) {
        updates.push({ id: match.id, sortOrder: index });
      }
      continue;
    }

    inserts.push({
      id: nanoid(),
      problemId,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isVisible: testCase.isVisible,
      sortOrder: index,
    });
  }

  const deleteIds = existingCases
    .map((testCase) => testCase.id)
    .filter((id) => !matchedIds.has(id));

  return { updates, inserts, deleteIds };
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
      try {
        await executor.insert(tags)
          .values({ id: newId, name: trimmed, createdBy, createdAt: new Date() });
        tagIds.push(newId);
      } catch {
        // Handle unique constraint race — re-fetch the existing tag
        const [raced] = await executor
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.name, trimmed))
          .limit(1);
        if (raced) tagIds.push(raced.id);
      }
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

async function syncProblemTestCases(
  problemId: string,
  values: ProblemMutationInput["testCases"],
  executor: DatabaseExecutor | TransactionClient = db
) {
  const existingCases = await executor
    .select({
      id: testCases.id,
      input: testCases.input,
      expectedOutput: testCases.expectedOutput,
      isVisible: testCases.isVisible,
      sortOrder: testCases.sortOrder,
    })
    .from(testCases)
    .where(eq(testCases.problemId, problemId))
    .orderBy(asc(testCases.sortOrder), asc(testCases.id));

  const plan = planProblemTestCaseSync(problemId, existingCases, values);

  for (const update of plan.updates) {
    await executor
      .update(testCases)
      .set({ sortOrder: update.sortOrder })
      .where(eq(testCases.id, update.id));
  }

  if (plan.deleteIds.length > 0) {
    await executor
      .delete(testCases)
      .where(inArray(testCases.id, plan.deleteIds));
  }

  if (plan.inserts.length > 0) {
    await executor.insert(testCases).values(plan.inserts);
  }
}

async function syncProblemFileLinks(
  problemId: string,
  description: string,
  executor: DatabaseExecutor | TransactionClient = db
) {
  const linkedFileIds = extractLinkedFileIds(description);

  await executor.update(files)
    .set({ problemId: null })
    .where(eq(files.problemId, problemId));

  if (linkedFileIds.length === 0) return;

  await executor.update(files)
    .set({ problemId })
    .where(inArray(files.id, linkedFileIds));
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
        description: sanitizeMarkdown(input.description),
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
        defaultLanguage: input.defaultLanguage ?? null,
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

    await syncProblemFileLinks(id, input.description, tx);

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
        description: sanitizeMarkdown(input.description),
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
        defaultLanguage: input.defaultLanguage ?? null,
        updatedAt: now,
      })
      .where(eq(problems.id, problemId));

    await syncProblemTestCases(problemId, input.testCases, tx);

    const tagIds = await resolveTagIdsWithExecutor(input.tags, actorId ?? "", tx);
    await syncProblemTags(problemId, tagIds, tx);

    await syncProblemFileLinks(problemId, input.description, tx);

  });
}

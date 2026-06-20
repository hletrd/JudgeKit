import { asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { db, execTransaction, type TransactionClient } from "@/lib/db";
import { problems, testCases, tags, problemTags, files } from "@/lib/db/schema";
import { extractLinkedFileIds } from "@/lib/files/problem-links";
import { resolveComparisonMode } from "@/lib/judge/function-judging/comparison";
import type { ProblemMutationInput } from "@/lib/validators/problem-management";
import { sanitizeMarkdown } from "@/lib/security/sanitize-html";
import { getDbNowUncached } from "@/lib/db-time";

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

/** Fast, collision-resistant signature for test-case deduplication.
 *  Replaces JSON.stringify so large cases don't allocate huge intermediate
 *  strings on every problem update. */
function testCaseSignature(
  input: string,
  expectedOutput: string,
  isVisible: boolean,
): string {
  const hash = createHash("sha256");
  hash.update(input);
  hash.update("\0");
  hash.update(expectedOutput);
  hash.update("\0");
  hash.update(isVisible ? "1" : "0");
  return hash.digest("hex");
}

/**
 * Sparse test case patch coming from the client during problem edit. The
 * client sends `undefined` (i.e. omits the key after JSON serialization) for
 * `input` or `expectedOutput` when the value is unchanged from what it
 * originally loaded, to save bandwidth on large cases. It sends them in
 * positional order matching the originally loaded list.
 */
export type ProblemTestCasePatch = {
  input?: string;
  expectedOutput?: string;
  isVisible?: boolean;
};

/**
 * Merge a positional sparse test case patch array against the existing test
 * cases for a problem. Unchanged fields fall back to the existing row at the
 * same index. Anything past the existing length is treated as a fresh test
 * case, where the client must have supplied full content (missing fields
 * fall back to empty strings and will fail downstream validation).
 *
 * This function exists because the PATCH /api/v1/problems/[id] route and its
 * client share an implicit positional contract, and a previous id-based
 * merge attempt silently swallowed every update because the client never
 * sends row ids.
 */
export function mergeTestCasePatchIntoExisting(
  sortedExisting: ExistingTestCaseRow[],
  patch: ProblemTestCasePatch[]
): ProblemMutationInput["testCases"] {
  return patch.map((tc, index) => {
    const existing = sortedExisting[index];
    return {
      input: tc.input ?? existing?.input ?? "",
      expectedOutput: tc.expectedOutput ?? existing?.expectedOutput ?? "",
      isVisible: tc.isVisible ?? existing?.isVisible ?? false,
    };
  });
}

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
    const signature = testCaseSignature(
      existing.input,
      existing.expectedOutput,
      Boolean(existing.isVisible),
    );
    const bucket = existingBySignature.get(signature) ?? [];
    bucket.push(existing);
    existingBySignature.set(signature, bucket);
  }

  for (const [index, testCase] of nextCases.entries()) {
    const signature = testCaseSignature(
      testCase.input,
      testCase.expectedOutput,
      Boolean(testCase.isVisible),
    );
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
          .values({ id: newId, name: trimmed, createdBy, createdAt: await getDbNowUncached() });
        tagIds.push(newId);
      } catch (error) {
        const pgErr = error as { code?: string };
        if (pgErr.code !== "23505") {
          throw error;
        }
        // Handle unique constraint race — re-fetch the existing tag
        const [raced] = await executor
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.name, trimmed))
          .limit(1);
        if (!raced) {
          throw error;
        }
        tagIds.push(raced.id);
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
  actorId: string,
  executor: DatabaseExecutor | TransactionClient = db
) {
  const linkedFileIds = extractLinkedFileIds(description);

  await executor.update(files)
    .set({ problemId: null })
    .where(eq(files.problemId, problemId));

  if (linkedFileIds.length === 0) return;

  const linkedRows = await executor
    .select({
      id: files.id,
      uploadedBy: files.uploadedBy,
      problemId: files.problemId,
    })
    .from(files)
    .where(inArray(files.id, linkedFileIds));

  const linkedRowById = new Map(linkedRows.map((row) => [row.id, row]));
  const unauthorized = linkedFileIds.filter((id) => {
    const row = linkedRowById.get(id);
    if (!row) return true;
    return row.uploadedBy !== actorId && row.problemId !== problemId;
  });

  if (unauthorized.length > 0) {
    throw new Error("fileLinkNotAllowed");
  }

  await executor.update(files)
    .set({ problemId })
    .where(inArray(files.id, linkedFileIds));
}

export async function createProblemWithTestCases(input: ProblemMutationInput, authorId: string) {
  const id = nanoid();
  const now = await getDbNowUncached();

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
        comparisonMode: resolveComparisonMode(input),
        floatAbsoluteError: input.floatAbsoluteError ?? null,
        floatRelativeError: input.floatRelativeError ?? null,
        difficulty: input.difficulty ?? null,
        defaultLanguage: input.defaultLanguage ?? null,
        // Function-judging fields are persisted only for function problems;
        // for auto/manual they are forced to null so stale specs can never leak.
        functionSpec: input.problemType === "function" ? input.functionSpec ?? null : null,
        referenceSolution: input.problemType === "function" ? input.referenceSolution ?? null : null,
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

    await syncProblemFileLinks(id, input.description, authorId, tx);

  });

  return id;
}

export async function updateProblemWithTestCases(problemId: string, input: ProblemMutationInput, actorId?: string) {
  const now = await getDbNowUncached();

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
        comparisonMode: resolveComparisonMode(input),
        floatAbsoluteError: input.floatAbsoluteError ?? null,
        floatRelativeError: input.floatRelativeError ?? null,
        difficulty: input.difficulty ?? null,
        defaultLanguage: input.defaultLanguage ?? null,
        // Function-judging fields are persisted only for function problems;
        // for auto/manual they are forced to null so stale specs can never leak.
        functionSpec: input.problemType === "function" ? input.functionSpec ?? null : null,
        referenceSolution: input.problemType === "function" ? input.referenceSolution ?? null : null,
        updatedAt: now,
      })
      .where(eq(problems.id, problemId));

    await syncProblemTestCases(problemId, input.testCases, tx);

    const tagIds = await resolveTagIdsWithExecutor(input.tags, actorId ?? "", tx);
    await syncProblemTags(problemId, tagIds, tx);

    await syncProblemFileLinks(problemId, input.description, actorId ?? "", tx);

  });
}

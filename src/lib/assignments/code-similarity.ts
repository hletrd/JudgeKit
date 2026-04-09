import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { rawQueryAll } from "@/lib/db/queries";
import { antiCheatEvents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { computeSimilarityRust } from "./code-similarity-client";

/**
 * Normalize source code for similarity comparison.
 * Strips comments, whitespace, and string literals to reduce false negatives.
 * Preserves C/C++ preprocessor directives (#include, #define, etc.).
 */
export function normalizeSource(source: string): string {
  return source
    // Remove single-line comments (// style)
    .replace(/\/\/.*$/gm, "")
    // Remove multi-line comments (/* */ style)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // Remove Python/Ruby comments but preserve C preprocessor directives
    // Only strip # comments that don't start with #include, #define, #pragma, #ifdef, etc.
    .replace(/^#(?!include|define|pragma|ifdef|ifndef|endif|else|elif|undef|if |error|warning).*$/gm, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    // Remove string literals
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .trim()
    .toLowerCase();
}

/**
 * Generate n-grams from text.
 */
function generateNgrams(text: string, n: number): Set<string> {
  const ngrams = new Set<string>();
  const tokens = text.split(/\s+/);
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(" "));
  }
  return ngrams;
}

/**
 * Compute Jaccard similarity between two sets.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

type SimilarityPair = {
  userId1: string;
  userId2: string;
  problemId: string;
  similarity: number;
};

type SubmissionRow = {
  userId: string;
  problemId: string;
  sourceCode: string;
};

/** Maximum elapsed ms before yielding the event loop during O(n^2) comparison. */
const YIELD_INTERVAL_MS = 8;
export const MAX_SUBMISSIONS_FOR_SIMILARITY = 500;

export type SimilarityRunStatus = "completed" | "not_run" | "timed_out";
export type SimilarityRunReason = "no_submissions" | "too_many_submissions" | "timeout" | null;

export type SimilarityRunResult = {
  status: SimilarityRunStatus;
  reason: SimilarityRunReason;
  pairs: SimilarityPair[];
  flaggedPairs: number;
  submissionCount: number | null;
  maxSupportedSubmissions: number;
};

/**
 * Run code similarity check using the TypeScript implementation.
 * Uses time-based yielding to keep the event loop responsive during
 * O(n^2) pair-wise n-gram comparison.
 */
async function runSimilarityCheckTS(
  rows: SubmissionRow[],
  threshold: number,
  ngramSize: number,
  signal?: AbortSignal,
): Promise<SimilarityPair[]> {
  // Group by problemId
  const byProblem = new Map<string, { userId: string; ngrams: Set<string> }[]>();
  for (const row of rows) {
    const normalized = normalizeSource(row.sourceCode);
    const ngrams = generateNgrams(normalized, ngramSize);
    const arr = byProblem.get(row.problemId) ?? [];
    arr.push({ userId: row.userId, ngrams });
    byProblem.set(row.problemId, arr);
  }

  const pairs: SimilarityPair[] = [];
  let lastYield = Date.now();

  for (const [problemId, entries] of byProblem) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (signal?.aborted) {
          throw new DOMException("Similarity check timed out", "AbortError");
        }
        const sim = jaccardSimilarity(entries[i].ngrams, entries[j].ngrams);
        if (sim >= threshold) {
          pairs.push({
            userId1: entries[i].userId,
            userId2: entries[j].userId,
            problemId,
            similarity: sim,
          });
        }
        // Yield based on elapsed wall-clock time for predictable responsiveness
        if (Date.now() - lastYield > YIELD_INTERVAL_MS) {
          await new Promise<void>((r) => setTimeout(r, 0));
          lastYield = Date.now();
        }
      }
    }
  }

  return pairs;
}

/**
 * Run code similarity check for all submissions in an assignment.
 * Compares best submissions per (user, problem) pair.
 * Returns pairs with similarity > threshold.
 *
 * Tries the Rust sidecar first for performance; falls back to TS if unavailable.
 */
export async function runSimilarityCheck(
  assignmentId: string,
  threshold = 0.85,
  ngramSize = 3,
  signal?: AbortSignal
): Promise<SimilarityRunResult> {
  if (signal?.aborted) {
    throw new DOMException("Similarity check timed out", "AbortError");
  }

  // Get best submission per (user, problem) — the one with highest score
  const rows = await rawQueryAll<SubmissionRow>(
    `WITH best AS (
      SELECT user_id AS "userId", problem_id AS "problemId", source_code AS "sourceCode",
             ROW_NUMBER() OVER (PARTITION BY user_id, problem_id ORDER BY score DESC, submitted_at DESC) AS rn
      FROM submissions
      WHERE assignment_id = @assignmentId
    )
    SELECT "userId", "problemId", "sourceCode" FROM best WHERE rn = 1`,
    { assignmentId }
  );

  if (rows.length === 0) {
    return {
      status: "not_run",
      reason: "no_submissions",
      pairs: [],
      flaggedPairs: 0,
      submissionCount: 0,
      maxSupportedSubmissions: MAX_SUBMISSIONS_FOR_SIMILARITY,
    };
  }

  // Guard against excessively large contests (O(n^2) comparison)
  if (rows.length > MAX_SUBMISSIONS_FOR_SIMILARITY) {
    return {
      status: "not_run",
      reason: "too_many_submissions",
      pairs: [],
      flaggedPairs: 0,
      submissionCount: rows.length,
      maxSupportedSubmissions: MAX_SUBMISSIONS_FOR_SIMILARITY,
    };
  }

  let pairs: SimilarityPair[];

  // Try Rust sidecar first
  try {
    const rustResult = await computeSimilarityRust(rows, threshold, ngramSize);
    if (rustResult !== null) {
      pairs = rustResult;
      return {
        status: "completed",
        reason: null,
        pairs,
        flaggedPairs: pairs.length,
        submissionCount: rows.length,
        maxSupportedSubmissions: MAX_SUBMISSIONS_FOR_SIMILARITY,
      };
    }
  } catch {
    // Rust sidecar unavailable — fall through to TS
  }

  pairs = await runSimilarityCheckTS(rows, threshold, ngramSize, signal);
  return {
    status: "completed",
    reason: null,
    pairs,
    flaggedPairs: pairs.length,
    submissionCount: rows.length,
    maxSupportedSubmissions: MAX_SUBMISSIONS_FOR_SIMILARITY,
  };
}

/**
 * Run similarity check and store flagged pairs as anti-cheat events.
 */
export async function runAndStoreSimilarityCheck(
  assignmentId: string,
  threshold = 0.85,
  signal?: AbortSignal
): Promise<SimilarityRunResult> {
  const result = await runSimilarityCheck(assignmentId, threshold, 3, signal);

  if (result.status !== "completed") {
    return result;
  }

  const { pairs } = result;

  // Batch all similarity events at once (before transaction — no DB access needed)
  const now = new Date();
  const eventValues = pairs.flatMap((pair) =>
    [pair.userId1, pair.userId2].map((userId) => {
      const otherUserId = userId === pair.userId1 ? pair.userId2 : pair.userId1;
      return {
        id: nanoid(),
        assignmentId,
        userId,
        eventType: "code_similarity" as const,
        details: JSON.stringify({
          pairedWith: otherUserId,
          problemId: pair.problemId,
          similarity: pair.similarity,
        }),
        createdAt: now,
      };
    })
  );

  // Atomic: delete old events and insert new ones
  await db.transaction(async (tx) => {
    await tx.delete(antiCheatEvents)
      .where(
        and(
          eq(antiCheatEvents.assignmentId, assignmentId),
          eq(antiCheatEvents.eventType, "code_similarity")
        )
      );

    if (eventValues.length > 0) {
      await tx.insert(antiCheatEvents).values(eventValues);
    }
  });

  return result;
}

import { nanoid } from "nanoid";
import { Worker } from "worker_threads";
import { db, sqlite } from "@/lib/db";
import { antiCheatEvents, submissions } from "@/lib/db/schema";
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

/**
 * Run code similarity check using the TypeScript implementation in a worker thread.
 * This is the fallback path when the Rust sidecar is unavailable.
 * Offloads the O(n^2) n-gram comparison to a worker thread to avoid blocking the main thread.
 */
function runSimilarityCheckTS(
  rows: SubmissionRow[],
  threshold: number,
  ngramSize: number
): Promise<SimilarityPair[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./similarity-worker.ts", import.meta.url),
      { workerData: { submissions: rows, threshold, ngramSize } }
    );
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Similarity check timed out"));
    }, 30_000);
    worker.on("message", (result: SimilarityPair[]) => {
      clearTimeout(timeout);
      resolve(result);
    });
    worker.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
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
  ngramSize = 3
): Promise<SimilarityPair[]> {
  // Get best submission per (user, problem) — the one with highest score
  const rows = sqlite
    .prepare<[string], SubmissionRow>(
      `WITH best AS (
        SELECT user_id AS userId, problem_id AS problemId, source_code AS sourceCode,
               ROW_NUMBER() OVER (PARTITION BY user_id, problem_id ORDER BY score DESC, submitted_at DESC) AS rn
        FROM submissions
        WHERE assignment_id = ?
      )
      SELECT userId, problemId, sourceCode FROM best WHERE rn = 1`
    )
    .all(assignmentId);

  // Guard against excessively large contests
  const MAX_SUBMISSIONS_FOR_SIMILARITY = 1000;
  if (rows.length > MAX_SUBMISSIONS_FOR_SIMILARITY) {
    return [];
  }

  // Try Rust sidecar first
  try {
    const rustResult = await computeSimilarityRust(rows, threshold, ngramSize);
    if (rustResult !== null) {
      return rustResult;
    }
  } catch {
    // Rust sidecar unavailable — fall through to TS
  }

  return await runSimilarityCheckTS(rows, threshold, ngramSize);
}

/**
 * Run similarity check and store flagged pairs as anti-cheat events.
 */
export async function runAndStoreSimilarityCheck(
  assignmentId: string,
  threshold = 0.85
): Promise<number> {
  const pairs = await runSimilarityCheck(assignmentId, threshold);

  // Delete previous code_similarity events for this assignment to avoid duplicates
  db.delete(antiCheatEvents)
    .where(
      and(
        eq(antiCheatEvents.assignmentId, assignmentId),
        eq(antiCheatEvents.eventType, "code_similarity")
      )
    )
    .run();

  for (const pair of pairs) {
    const now = new Date();
    // Store event for both users
    for (const userId of [pair.userId1, pair.userId2]) {
      const otherUserId =
        userId === pair.userId1 ? pair.userId2 : pair.userId1;
      db.insert(antiCheatEvents)
        .values({
          id: nanoid(),
          assignmentId,
          userId,
          eventType: "code_similarity",
          details: JSON.stringify({
            pairedWith: otherUserId,
            problemId: pair.problemId,
            similarity: pair.similarity,
          }),
          createdAt: now,
        })
        .run();
    }
  }

  return pairs.length;
}

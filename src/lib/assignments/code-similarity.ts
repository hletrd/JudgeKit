import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { rawQueryAll } from "@/lib/db/queries";
import { antiCheatEvents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getDbNowUncached } from "@/lib/db-time";
import { computeSimilarityRust } from "./code-similarity-client";

/**
 * Maximum length (in characters) of a single string literal before the
 * normalizer truncates it. Prevents CPU waste on pathological inputs
 * (e.g., a 256 KB base64 blob inside a single string) and bounds the
 * inner while-loop iterations for unclosed strings.
 */
const MAX_STRING_LITERAL_LENGTH = 10_000;

/**
 * Normalize source code for similarity comparison.
 * Strips comments, whitespace, and string literals to reduce false negatives.
 * Preserves C/C++ preprocessor directives (#include, #define, etc.).
 * Handles double-quoted, single-quoted, and backtick-delimited (template)
 * strings. Unclosed strings are discarded entirely (opening quote NOT output)
 * to avoid consuming the rest of the file as string content, which would
 * cause identifiers after the unclosed string to be skipped by
 * normalizeIdentifiersForSimilarity().
 */
export function normalizeSource(source: string): string {
  let result = "";
  let index = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index + 1 < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      if (index + 1 < source.length) {
        index += 2;
      }
      continue;
    }

    if (current === "#") {
      const isLineStart = index === 0 || source[index - 1] === "\n";
      if (!(isLineStart && startsWithPreprocessorDirective(source, index))) {
        while (index < source.length && source[index] !== "\n") {
          index += 1;
        }
        continue;
      }
    }

    // String literals (double-quoted, single-quoted, backtick-delimited):
    // output delimiters but strip content. Unclosed strings are discarded
    // (opening quote NOT output) so subsequent code is still processed.
    if (current === "\"" || current === "'" || current === "`") {
      const delimiter = current;
      // Template literals can span lines; regular strings cannot.
      const newlineTerminates = delimiter !== "`";
      index += 1;
      let stringLength = 0;
      while (
        index < source.length
        && source[index] !== delimiter
        && (!newlineTerminates || source[index] !== "\n")
        && stringLength < MAX_STRING_LITERAL_LENGTH
      ) {
        if (source[index] === "\\" && index + 1 < source.length) {
          index += 2;
          stringLength += 2;
          continue;
        }
        index += 1;
        stringLength += 1;
      }
      if (index < source.length && source[index] === delimiter) {
        result += delimiter + delimiter;
        index += 1;
      }
      // Unclosed: don't output the opening delimiter.
      continue;
    }

    if (/\s/.test(current)) {
      if (result.length > 0 && !result.endsWith(" ")) {
        result += " ";
      }
      index += 1;
      while (index < source.length && /\s/.test(source[index])) {
        index += 1;
      }
      continue;
    }

    result += current;
    index += 1;
  }

  return result.trimEnd();
}

const SIMILARITY_KEYWORDS = new Set([
  "and", "as", "asm", "auto", "await", "bool", "break", "case", "catch", "char", "class",
  "const", "constexpr", "continue", "crate", "default", "def", "define", "delete", "do",
  "double", "elif", "else", "endif", "enum", "error", "except", "export", "extends", "extern",
  "false", "final", "finally", "float", "fn", "for", "friend", "from", "goto", "if", "ifdef",
  "ifndef", "impl", "import", "include", "inline", "in", "int", "interface", "let", "long",
  "macro_rules", "match", "mod", "module", "mut", "namespace", "new", "None", "not", "null",
  "operator", "or", "package", "pragma", "private", "protected", "pub", "public", "register",
  "restrict", "return", "self", "Self", "short", "signed", "sizeof", "static", "struct",
  "super", "switch", "template", "this", "throw", "trait", "true", "try", "type", "typedef",
  "typename", "undef", "union", "unsafe", "unsigned", "use", "using", "var", "virtual", "void",
  "volatile", "warning", "where", "while", "yield",
]);

function isIdentifierStart(char: string) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierChar(char: string) {
  return /[A-Za-z0-9_]/.test(char);
}

export function normalizeIdentifiersForSimilarity(source: string): string {
  let result = "";
  let index = 0;
  let nextPlaceholderId = 1;
  const identifierMap = new Map<string, string>();

  while (index < source.length) {
    const current = source[index];

    if (!isIdentifierStart(current)) {
      result += current;
      index += 1;
      continue;
    }

    const start = index;
    index += 1;
    while (index < source.length && isIdentifierChar(source[index])) {
      index += 1;
    }

    const token = source.slice(start, index);
    if (SIMILARITY_KEYWORDS.has(token)) {
      result += token;
      continue;
    }

    let normalizedToken = identifierMap.get(token);
    if (!normalizedToken) {
      normalizedToken = `v${nextPlaceholderId++}`;
      identifierMap.set(token, normalizedToken);
    }

    result += normalizedToken;
  }

  return result;
}

const PREPROCESSOR_DIRECTIVES = [
  "include",
  "define",
  "pragma",
  "ifdef",
  "ifndef",
  "endif",
  "else",
  "elif",
  "undef",
  "if ",
  "error",
  "warning",
] as const;

function startsWithPreprocessorDirective(source: string, hashIndex: number): boolean {
  const remainder = source.slice(hashIndex + 1);
  return PREPROCESSOR_DIRECTIVES.some((directive) => remainder.startsWith(directive));
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
  language: string;
  similarity: number;
};

type SubmissionRow = {
  userId: string;
  problemId: string;
  language: string;
  sourceCode: string;
};

/** Maximum elapsed ms before yielding the event loop during O(n^2) comparison. */
const YIELD_INTERVAL_MS = 8;
export const MAX_SUBMISSIONS_FOR_SIMILARITY = 500;

export type SimilarityRunStatus = "completed" | "not_run" | "timed_out";
export type SimilarityRunReason =
  | "no_submissions"
  | "too_many_submissions"
  | "service_unavailable"
  | "timeout"
  | null;

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
  // Group by (problemId, language) so cross-language pairs are never compared
  const byKey = new Map<string, { userId: string; ngrams: Set<string>; problemId: string; language: string }[]>();
  for (const row of rows) {
    const normalized = normalizeIdentifiersForSimilarity(normalizeSource(row.sourceCode));
    const ngrams = generateNgrams(normalized, ngramSize);
    const key = `${row.problemId}\0${row.language}`;
    const arr = byKey.get(key) ?? [];
    arr.push({ userId: row.userId, ngrams, problemId: row.problemId, language: row.language });
    byKey.set(key, arr);
  }

  const pairs: SimilarityPair[] = [];
  // Use performance.now() instead of Date.now() for yield timing.
  // performance.now() is monotonic and not affected by NTP clock adjustments,
  // making it more reliable for measuring elapsed duration. See C12b-3.
  let lastYield = performance.now();

  for (const [, entries] of byKey) {
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
            problemId: entries[i].problemId,
            language: entries[i].language,
            similarity: sim,
          });
        }
        // Yield based on elapsed monotonic time for predictable responsiveness.
        // performance.now() avoids NTP clock-adjustment jumps that Date.now()
        // can suffer. See C12b-3.
        if (performance.now() - lastYield > YIELD_INTERVAL_MS) {
          await new Promise<void>((r) => setTimeout(r, 0));
          lastYield = performance.now();
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

  // Get best submission per (user, problem, language) — compare only same-language attempts and keep the highest-scoring/latest row within each language bucket
  const rows = await rawQueryAll<SubmissionRow>(
    `WITH best AS (
      SELECT user_id AS "userId", problem_id AS "problemId", language, source_code AS "sourceCode",
             ROW_NUMBER() OVER (PARTITION BY user_id, problem_id, language ORDER BY score DESC, submitted_at DESC) AS rn
      FROM submissions
      WHERE assignment_id = @assignmentId
    )
    SELECT "userId", "problemId", "language", "sourceCode" FROM best WHERE rn = 1`,
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

  // Guard against excessively large contests only for the TypeScript fallback.
  if (rows.length > MAX_SUBMISSIONS_FOR_SIMILARITY) {
    return {
      status: "not_run",
      reason: "service_unavailable",
      pairs: [],
      flaggedPairs: 0,
      submissionCount: rows.length,
      maxSupportedSubmissions: MAX_SUBMISSIONS_FOR_SIMILARITY,
    };
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
  const now = await getDbNowUncached();
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

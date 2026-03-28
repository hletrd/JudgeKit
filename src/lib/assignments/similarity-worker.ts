import { parentPort, workerData } from "worker_threads";

/**
 * Normalize source code for similarity comparison.
 * Strips comments, whitespace, and string literals to reduce false negatives.
 * Preserves C/C++ preprocessor directives (#include, #define, etc.).
 */
function normalizeSource(source: string): string {
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
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

type SubmissionRow = {
  userId: string;
  problemId: string;
  sourceCode: string;
};

type SimilarityPair = {
  userId1: string;
  userId2: string;
  problemId: string;
  similarity: number;
};

const { submissions, threshold, ngramSize } = workerData as {
  submissions: SubmissionRow[];
  threshold: number;
  ngramSize: number;
};

// Group by problem
const byProblem = new Map<string, Array<{ userId: string; sourceCode: string }>>();
for (const row of submissions) {
  if (!byProblem.has(row.problemId)) {
    byProblem.set(row.problemId, []);
  }
  byProblem.get(row.problemId)!.push({
    userId: row.userId,
    sourceCode: row.sourceCode,
  });
}

const flaggedPairs: SimilarityPair[] = [];

// Compare all pairs within each problem
for (const [problemId, subs] of byProblem) {
  // Pre-compute n-grams
  const ngrams = subs.map((s) => ({
    userId: s.userId,
    ngrams: generateNgrams(normalizeSource(s.sourceCode), ngramSize),
  }));

  for (let i = 0; i < ngrams.length; i++) {
    for (let j = i + 1; j < ngrams.length; j++) {
      const sim = jaccardSimilarity(ngrams[i].ngrams, ngrams[j].ngrams);
      if (sim >= threshold) {
        flaggedPairs.push({
          userId1: ngrams[i].userId,
          userId2: ngrams[j].userId,
          problemId,
          similarity: Math.round(sim * 1000) / 1000,
        });
      }
    }
  }
}

parentPort?.postMessage(flaggedPairs);

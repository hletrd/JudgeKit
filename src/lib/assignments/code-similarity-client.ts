const CODE_SIMILARITY_URL =
  process.env.CODE_SIMILARITY_URL || "http://127.0.0.1:3002";
const CODE_SIMILARITY_AUTH_TOKEN = process.env.CODE_SIMILARITY_AUTH_TOKEN ?? "";

interface RustSubmission {
  userId: string;
  problemId: string;
  language: string;
  sourceCode: string;
}

interface RustSimilarityPair {
  userId1: string;
  userId2: string;
  problemId: string;
  language: string;
  similarity: number;
}

interface RustComputeResponse {
  pairs: RustSimilarityPair[];
}

/**
 * Call the Rust code-similarity sidecar to compute similarity pairs.
 * Fail-open: returns null if the service is unreachable or errors.
 */
export async function computeSimilarityRust(
  submissions: RustSubmission[],
  threshold: number = 0.85,
  ngramSize: number = 3
): Promise<RustSimilarityPair[] | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (CODE_SIMILARITY_AUTH_TOKEN.length > 0) {
      headers.Authorization = `Bearer ${CODE_SIMILARITY_AUTH_TOKEN}`;
    }
    const response = await fetch(`${CODE_SIMILARITY_URL}/compute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        submissions,
        threshold,
        ngram_size: ngramSize,
      }),
      signal: AbortSignal.timeout(25_000), // 25s timeout — API route has 30s
    });
    if (!response.ok) return null;
    const data = (await response.json()) as RustComputeResponse;
    return data.pairs;
  } catch {
    return null; // Fail open — fall back to TS implementation
  }
}

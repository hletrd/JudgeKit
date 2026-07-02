import { logger } from "@/lib/logger";

const CODE_SIMILARITY_URL =
  process.env.CODE_SIMILARITY_URL || "http://127.0.0.1:3002";
const CODE_SIMILARITY_AUTH_TOKEN = process.env.CODE_SIMILARITY_AUTH_TOKEN ?? "";
const SIDECAR_TIMEOUT_MS = 25_000;

if (process.env.CODE_SIMILARITY_URL && !CODE_SIMILARITY_AUTH_TOKEN) {
  logger.warn(
    "[code-similarity] CODE_SIMILARITY_URL is set but CODE_SIMILARITY_AUTH_TOKEN is missing — " +
    "requests to the similarity service will be unauthenticated."
  );
}

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

export type SimilaritySidecarErrorCode =
  | "SIDECAR_ABORTED"
  | "SIDECAR_TIMEOUT"
  | "SIDECAR_HTTP_ERROR"
  | "SIDECAR_INVALID_RESPONSE"
  | "SIDECAR_UNAVAILABLE";

export type SimilaritySidecarResult = RustSimilarityPair[] | SimilaritySidecarErrorCode;

/**
 * Call the Rust code-similarity sidecar to compute similarity pairs.
 *
 * Returns the pairs on success, or a structured error code on failure.
 * The caller's AbortSignal is composed with a sidecar-specific timeout so
 * route-level cancellation is respected without masking genuine sidecar
 * failures as timeouts.
 */
export async function computeSimilarityRust(
  submissions: RustSubmission[],
  threshold: number = 0.85,
  ngramSize: number = 3,
  signal?: AbortSignal
): Promise<SimilaritySidecarResult> {
  const timeoutSignal = AbortSignal.timeout(SIDECAR_TIMEOUT_MS);
  const composedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

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
      signal: composedSignal,
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, statusText: response.statusText },
        "[code-similarity] sidecar returned a non-ok response"
      );
      return "SIDECAR_HTTP_ERROR";
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      logger.warn({ err }, "[code-similarity] failed to parse sidecar JSON response");
      return "SIDECAR_INVALID_RESPONSE";
    }

    const responseBody = data as RustComputeResponse | null;
    if (!responseBody || !Array.isArray(responseBody.pairs)) {
      logger.warn({ response: data }, "[code-similarity] sidecar response missing pairs array");
      return "SIDECAR_INVALID_RESPONSE";
    }

    return responseBody.pairs;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (signal?.aborted) {
        logger.warn("[code-similarity] sidecar request aborted by caller signal");
        return "SIDECAR_ABORTED";
      }
      logger.warn("[code-similarity] sidecar request timed out");
      return "SIDECAR_TIMEOUT";
    }

    logger.warn({ err }, "[code-similarity] sidecar request failed");
    return "SIDECAR_UNAVAILABLE";
  }
}

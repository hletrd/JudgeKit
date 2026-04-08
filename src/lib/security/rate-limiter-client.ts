const RATE_LIMITER_URL = process.env.RATE_LIMITER_URL || "http://127.0.0.1:3001";

interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number | null;
}

interface RecordFailureResult {
  blocked: boolean;
  blockedUntil: number | null;
}

/**
 * Circuit breaker: after FAILURE_THRESHOLD consecutive failures to reach the
 * rate-limiter sidecar, we stop trying for RECOVERY_WINDOW_MS and let callers
 * know the service is degraded (returns null so callers can use in-memory fallback).
 */
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const FAILURE_THRESHOLD = 3;
const RECOVERY_WINDOW_MS = 30_000;

async function callRateLimiter<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  // Circuit open — skip network call
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    if (Date.now() < circuitOpenUntil) {
      return null;
    }
    // Recovery attempt — try one request
  }

  try {
    const response = await fetch(`${RATE_LIMITER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) {
      consecutiveFailures++;
      circuitOpenUntil = Date.now() + RECOVERY_WINDOW_MS;
      return null;
    }
    consecutiveFailures = 0; // Reset on success
    return await response.json() as T;
  } catch {
    consecutiveFailures++;
    circuitOpenUntil = Date.now() + RECOVERY_WINDOW_MS;
    return null;
  }
}

/** True when the external rate limiter sidecar is unreachable. */
export function isRateLimiterDegraded(): boolean {
  return consecutiveFailures >= FAILURE_THRESHOLD && Date.now() < circuitOpenUntil;
}

export async function checkRateLimit(
  key: string,
  maxAttempts: number = 30,
  windowMs: number = 60000
): Promise<RateLimitCheckResult> {
  const result = await callRateLimiter<RateLimitCheckResult>("/check", { key, maxAttempts, windowMs });
  if (result) return result;

  // Sidecar unreachable — deny by default for safety
  return { allowed: false, remaining: 0, retryAfter: Date.now() + RECOVERY_WINDOW_MS };
}

export async function recordRateLimitFailure(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 60000,
  blockMs: number = 900000
): Promise<RecordFailureResult> {
  const result = await callRateLimiter<RecordFailureResult>("/record-failure", { key, maxAttempts, windowMs, blockMs });
  return result ?? { blocked: false, blockedUntil: null };
}

export async function resetRateLimit(key: string): Promise<void> {
  await callRateLimiter("/reset", { key });
}

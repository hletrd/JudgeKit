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

async function callRateLimiter<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch(`${RATE_LIMITER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(500), // 500ms timeout, fallback to allow
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null; // Fail open — if rate limiter is down, allow the request
  }
}

export async function checkRateLimit(
  key: string,
  maxAttempts: number = 30,
  windowMs: number = 60000
): Promise<RateLimitCheckResult> {
  const result = await callRateLimiter<RateLimitCheckResult>("/check", { key, maxAttempts, windowMs });
  return result ?? { allowed: true, remaining: maxAttempts, retryAfter: null };
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

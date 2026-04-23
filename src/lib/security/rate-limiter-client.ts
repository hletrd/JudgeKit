/**
 * Client for the rate-limiter-rs sidecar.
 *
 * The sidecar is an optional in-memory fast path that sits in front of the
 * durable PostgreSQL-backed limiter (src/lib/security/rate-limit.ts and
 * src/lib/security/api-rate-limit.ts). Callers try the sidecar first and
 * fall back to the DB path when the sidecar is unreachable — the sidecar is
 * best-effort, so a network hiccup MUST NOT deny legitimate traffic.
 *
 * Contract:
 *   - returns a result object when the sidecar gave a definitive answer
 *   - returns null when the sidecar is unreachable or returned no data; the
 *     caller must fall back to its authoritative limiter
 *
 * Configuration:
 *   - RATE_LIMITER_URL: base URL of the sidecar (e.g. http://rate-limiter:3001
 *     in docker-compose, unset for standalone installs where the DB path is
 *     the only limiter).
 */

import { logger } from "@/lib/logger";

const RATE_LIMITER_URL = process.env.RATE_LIMITER_URL ?? "";
const RATE_LIMITER_AUTH_TOKEN = process.env.RATE_LIMITER_AUTH_TOKEN ?? "";

export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number | null;
}

export interface RecordFailureResult {
  blocked: boolean;
  blockedUntil: number | null;
}

/**
 * Circuit breaker: after FAILURE_THRESHOLD consecutive failures to reach the
 * sidecar we stop trying for RECOVERY_WINDOW_MS. This avoids a 500ms timeout
 * on every request when the sidecar is down, which would itself look like a
 * denial of service.
 */
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const FAILURE_THRESHOLD = 3;
const RECOVERY_WINDOW_MS = 30_000;
const REQUEST_TIMEOUT_MS = 500;

function isSidecarConfigured(): boolean {
  return RATE_LIMITER_URL.length > 0;
}

async function callRateLimiter<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  if (!isSidecarConfigured()) {
    return null;
  }

  // Circuit open — skip network call until the recovery window elapses
  if (consecutiveFailures >= FAILURE_THRESHOLD && Date.now() < circuitOpenUntil) {
    return null;
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (RATE_LIMITER_AUTH_TOKEN.length > 0) {
      headers.Authorization = `Bearer ${RATE_LIMITER_AUTH_TOKEN}`;
    }
    const response = await fetch(`${RATE_LIMITER_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      consecutiveFailures++;
      circuitOpenUntil = Date.now() + RECOVERY_WINDOW_MS;
      return null;
    }
    const data = (await response.json().catch(() => null)) as T | null;
    if (data === null) {
      // Non-JSON response body (e.g., HTML from a misconfigured proxy).
      // Treat as a sidecar error but log separately from network failures.
      consecutiveFailures++;
      circuitOpenUntil = Date.now() + RECOVERY_WINDOW_MS;
      return null;
    }
    consecutiveFailures = 0;
    return data;
  } catch (err) {
    consecutiveFailures++;
    circuitOpenUntil = Date.now() + RECOVERY_WINDOW_MS;
    logger.warn({ err, path }, "[rate-limiter] sidecar unreachable, circuit breaker updated");
    return null;
  }
}

/** True when the sidecar is configured but the circuit breaker is open. */
export function isRateLimiterDegraded(): boolean {
  if (!isSidecarConfigured()) {
    return false;
  }
  return consecutiveFailures >= FAILURE_THRESHOLD && Date.now() < circuitOpenUntil;
}

/**
 * Check (and increment) the sidecar counter for `key`.
 *
 * Returns the sidecar's answer on success, or `null` when the sidecar is
 * unreachable / not configured. A null return means "the sidecar doesn't
 * know" and the caller must use the DB-backed limiter to decide. Never
 * return an `allowed: false` synthetic result — that would fail-closed and
 * turn a sidecar outage into a self-inflicted denial of service.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number = 30,
  windowMs: number = 60000
): Promise<RateLimitCheckResult | null> {
  return callRateLimiter<RateLimitCheckResult>("/check", { key, maxAttempts, windowMs });
}

/**
 * Record a failure against `key` on the sidecar. Returns the block result on
 * success or `null` when the sidecar is unreachable so the caller can fall
 * back to the DB path.
 */
export async function recordRateLimitFailure(
  key: string,
  maxAttempts: number = 5,
  windowMs: number = 60000,
  blockMs: number = 900000
): Promise<RecordFailureResult | null> {
  return callRateLimiter<RecordFailureResult>("/record-failure", { key, maxAttempts, windowMs, blockMs });
}

/** Best-effort reset of a sidecar counter. Silently no-ops if unreachable. */
export async function resetRateLimit(key: string): Promise<void> {
  await callRateLimiter("/reset", { key });
}

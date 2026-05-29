/**
 * Cross-instance API rate limiting backed by PostgreSQL with an optional
 * sidecar fast-path (`rate-limiter-client`).
 *
 * All timestamp comparisons use DB server time (`getDbNowMs` /
 * `getDbNowUncached`) to avoid clock skew between the app server and the
 * database server. This ensures consistency with `./rate-limit.ts` (login
 * /auth limits) which writes to the same `rateLimits` table using DB time.
 *
 * NOTE: there are two rate-limit modules in this directory. Use this one
 * for cross-instance API limits. Use `./rate-limit.ts` for login/auth limits
 * (writes to the same `rateLimits` table). Drift between the two is tracked
 * under C7-AGG-9 (rate-limit consolidation cycle); if you fix a bug here,
 * search the sibling module for the same pattern and apply the equivalent
 * fix. The previous in-memory limiter (`in-memory-rate-limit.ts`) was
 * removed because it had no production callers and exposed an authoritative
 * store that resets on process restart — the DB-backed path is the only
 * supported authority.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRateLimitKey } from "./rate-limit";
import { checkRateLimit as sidecarCheck } from "./rate-limiter-client";
import { fetchRateLimitEntry } from "@/lib/security/rate-limit-core";
import { execTransaction } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { getDbNowMs } from "@/lib/db-time";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { eq } from "drizzle-orm";

function getApiRateLimitConfig() {
  const s = getConfiguredSettings();
  return { max: s.apiRateLimitMax, windowMs: s.apiRateLimitWindowMs };
}

/**
 * Fast path: ask the rate-limiter-rs sidecar before touching Postgres.
 *
 * Returns:
 *   - true  → sidecar says the key is already over its limit, caller should
 *             return 429 immediately without hitting the DB.
 *   - false → sidecar accepted the request (incremented its counter). The
 *             DB path still runs as the source of truth so persistence and
 *             audit_events stay consistent even if the sidecar is wiped on
 *             restart.
 *   - null  → sidecar is unreachable or unconfigured. Caller must fall back
 *             to the DB path; the sidecar MUST NEVER fail-closed here.
 */
async function sidecarConsume(key: string): Promise<boolean | null> {
  const { max, windowMs } = getApiRateLimitConfig();
  const result = await sidecarCheck(key, max, windowMs);
  if (result === null) {
    return null;
  }
  return !result.allowed;
}

// NOTE: Rate-limit deduplication within a single request is intentionally
// NOT implemented. Next.js creates new NextRequest objects at middleware/
// route boundaries, making object-identity-based dedup unreliable. Each call
// to consumeApiRateLimit counts as a separate consumption. Callers that need
// to check multiple rate limits for the same request should do so explicitly.

/**
 * Atomically check rate limit and record an API request attempt inside a
 * PostgreSQL transaction with SELECT FOR UPDATE to prevent TOCTOU races.
 * Returns { limited, nowMs } — limited is true if the request is rate-limited,
 * nowMs is the app-server timestamp used for the window computation.
 */
async function atomicConsumeRateLimit(key: string): Promise<{ limited: boolean; nowMs: number }> {
  // Use DB server time for rate-limit window comparisons to avoid clock skew
  // between app and DB servers, consistent with checkServerActionRateLimit
  // and other rate-limit checks (realtime-coordination.ts, submissions.ts).
  const now = await getDbNowMs();
  const { max: apiMax, windowMs } = getApiRateLimitConfig();

  const limited = await execTransaction(async (tx) => {
    const existing = await fetchRateLimitEntry(tx, key);

    if (!existing) {
      // API rate limits use fixed blocking without exponential backoff
      // (consecutiveBlocks is always 0). Login rate limits use backoff,
      // but API endpoints typically have much higher thresholds and the
      // escalation is not needed.
      await tx.insert(rateLimits)
        .values({
          key,
          attempts: 1,
          windowStartedAt: now,
          blockedUntil: null,
          consecutiveBlocks: 0,
          lastAttempt: now,
        });
      return false;
    }

    if (existing.blockedUntil && existing.blockedUntil >= now) {
      return true;
    }

    if (existing.windowStartedAt + windowMs <= now) {
      await tx.update(rateLimits)
        .set({ attempts: 1, windowStartedAt: now, lastAttempt: now, blockedUntil: null })
        .where(eq(rateLimits.key, key));
      return false;
    }

    if (existing.attempts >= apiMax) {
      return true;
    }

    const newAttempts = existing.attempts + 1;
    const blocked = newAttempts >= apiMax ? now + windowMs : null;

    await tx.update(rateLimits)
      .set({
        attempts: newAttempts,
        lastAttempt: now,
        blockedUntil: blocked,
      })
      .where(eq(rateLimits.key, key));

    return false;
  });

  return { limited, nowMs: now };
}

function rateLimitedResponse(windowMs: number | undefined, nowMs: number) {
  const retryAfter = windowMs ? Math.ceil(windowMs / 1000) : 60;
  const resetMs = nowMs + (windowMs ?? 60_000);
  return NextResponse.json(
    { error: "rateLimited" },
    { status: 429, headers: {
      "Retry-After": String(retryAfter),
      "X-RateLimit-Limit": String(getApiRateLimitConfig().max),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
    } }
  );
}

/**
 * Consume one rate limit token for a mutation endpoint.
 * Returns a 429 response if rate limited, or null if allowed.
 *
 * Two-tier strategy:
 *   1. sidecar pre-check — fast path, no DB round-trip if the key is already
 *      over its limit. Saves a transaction per request under load.
 *   2. authoritative DB check — always runs when the sidecar allowed the
 *      request (or was unreachable). Keeps Postgres as the single source of
 *      truth for state that survives a sidecar restart.
 */
export async function consumeApiRateLimit(
  request: NextRequest,
  endpoint: string
): Promise<NextResponse | null> {
  const key = getRateLimitKey(`api:${endpoint}`, request.headers);

  const { windowMs } = getApiRateLimitConfig();

  const sidecarVerdict = await sidecarConsume(key);
  if (sidecarVerdict === true) {
    // Use DB server time for the X-RateLimit-Reset header to maintain
    // consistency with the DB path and avoid clock-skew between app
    // and DB servers, consistent with atomicConsumeRateLimit.
    const nowMs = await getDbNowMs();
    return rateLimitedResponse(windowMs, nowMs);
  }

  const { limited, nowMs } = await atomicConsumeRateLimit(key);
  if (limited) {
    return rateLimitedResponse(windowMs, nowMs);
  }

  return null;
}

/**
 * Consume one rate limit token keyed on a stable per-caller identity.
 *
 * The `scope` is any stable identifier for the caller: an authenticated user id,
 * an `ip:<ip>` string, an `auth:<hash>` fallback, or a workerId. Use for API
 * endpoints where plain IP-based limiting is insufficient (shared IPs, VPNs) or
 * where the caller is identified by something other than a session user (e.g. the
 * judge claim endpoint keys on workerId / IP / auth-hash).
 *
 * NOTE: the key template keeps the literal `:user:` infix for backward
 * compatibility — existing buckets in the `rate_limits` table must not reset on
 * deploy. The infix is historical and does NOT imply `scope` is always a user id.
 *
 * Returns a 429 response if rate limited, or null if allowed.
 *
 * Same two-tier strategy as {@link consumeApiRateLimit}.
 */
export async function consumeUserApiRateLimit(
  request: NextRequest,
  scope: string,
  endpoint: string,
): Promise<NextResponse | null> {
  const key = `api:${endpoint}:user:${scope}`;

  const { windowMs } = getApiRateLimitConfig();

  const sidecarVerdict = await sidecarConsume(key);
  if (sidecarVerdict === true) {
    // Use DB server time for the X-RateLimit-Reset header to maintain
    // consistency with the DB path and avoid clock-skew between app
    // and DB servers, consistent with atomicConsumeRateLimit.
    const nowMs = await getDbNowMs();
    return rateLimitedResponse(windowMs, nowMs);
  }

  const { limited, nowMs } = await atomicConsumeRateLimit(key);
  if (limited) {
    return rateLimitedResponse(windowMs, nowMs);
  }

  return null;
}

/**
 * SEC H-1: per-user daily quota for sandbox-heavy endpoints
 * (playground/compiler). Uses the same `rate_limits` table as the
 * short-window limiter above but with a 24h window and an explicit
 * `max` parameter so different endpoints can pick their own ceiling.
 * Returns a 429 response if the user has exhausted their daily budget,
 * or null if the call is allowed.
 *
 * Resets automatically once 24h elapses since the bucket was opened.
 */
export async function consumeUserDailyQuota(
  userId: string,
  endpoint: string,
  maxPerDay: number,
): Promise<NextResponse | null> {
  const key = `daily:${endpoint}:user:${userId}`;
  const windowMs = 24 * 60 * 60 * 1000;
  const now = await getDbNowMs();

  const limited = await execTransaction(async (tx) => {
    const existing = await fetchRateLimitEntry(tx, key);

    if (!existing) {
      await tx.insert(rateLimits).values({
        key,
        attempts: 1,
        windowStartedAt: now,
        blockedUntil: null,
        consecutiveBlocks: 0,
        lastAttempt: now,
      });
      return false;
    }

    if (existing.windowStartedAt + windowMs <= now) {
      await tx
        .update(rateLimits)
        .set({ attempts: 1, windowStartedAt: now, lastAttempt: now, blockedUntil: null })
        .where(eq(rateLimits.key, key));
      return false;
    }

    if (existing.attempts >= maxPerDay) {
      return true;
    }

    await tx
      .update(rateLimits)
      .set({ attempts: existing.attempts + 1, lastAttempt: now })
      .where(eq(rateLimits.key, key));
    return false;
  });

  if (limited) {
    return NextResponse.json(
      { error: "dailyQuotaExceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(windowMs / 1000)),
          "X-RateLimit-Limit": String(maxPerDay),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil((now + windowMs) / 1000)),
        },
      },
    );
  }

  return null;
}

/**
 * Check and record a rate limit for a server action.
 * Keyed on the provided key + actionName so each key has its own counter.
 * Use a userId for per-user limits, or a client IP for per-IP limits.
 * Returns { error: "rateLimited" } if the limit is exceeded, or null if allowed.
 */
export async function checkServerActionRateLimit(
  key: string,
  actionName: string,
  maxRequests: number = 20,
  windowSeconds: number = 60,
): Promise<{ error: string } | null> {
  const rateLimitKey = `sa:${key}:${actionName}`;
  const windowMs = windowSeconds * 1000;

  return execTransaction(async (tx) => {
    // Use DB server time for rate-limit window comparisons to avoid clock skew
    // between app and DB servers, consistent with atomicConsumeRateLimit above
    // and other rate-limit checks (realtime-coordination.ts, submissions.ts).
    // Previously used getDbNowUncached().getTime() which introduces a Date
    // intermediary; unified on getDbNowMs() for consistency. See C9-7.
    const now = await getDbNowMs();
    const existing = await fetchRateLimitEntry(tx, rateLimitKey);

    // If still within a block period, reject immediately
    if (existing?.blockedUntil && existing.blockedUntil >= now) {
      return { error: "rateLimited" };
    }

    let attempts: number;
    let windowStartedAt: number;
    let exists: boolean;

    if (!existing) {
      attempts = 0;
      windowStartedAt = now;
      exists = false;
    } else if (existing.windowStartedAt + windowMs <= now) {
      attempts = 0;
      windowStartedAt = now;
      exists = true;
    } else {
      attempts = existing.attempts;
      windowStartedAt = existing.windowStartedAt;
      exists = true;
    }

    if (attempts >= maxRequests) {
      return { error: "rateLimited" };
    }

    const newAttempts = attempts + 1;
    // Set blockedUntil when the limit is hit so there is a cooldown period
    // instead of allowing immediate retries after the window expires.
    const blockedUntil = newAttempts >= maxRequests ? now + windowMs : null;

    if (exists) {
      await tx.update(rateLimits)
        .set({ attempts: newAttempts, windowStartedAt, lastAttempt: now, blockedUntil })
        .where(eq(rateLimits.key, rateLimitKey));
    } else {
      await tx.insert(rateLimits)
        .values({
          key: rateLimitKey,
          attempts: newAttempts,
          windowStartedAt,
          blockedUntil,
          consecutiveBlocks: 0,
          lastAttempt: now,
        });
    }

    return null;
  });
}

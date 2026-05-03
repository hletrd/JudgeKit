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
import { execTransaction } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { getDbNowMs, getDbNowUncached } from "@/lib/db-time";
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

const consumedRequestKeys = new WeakMap<NextRequest, Set<string>>();

function rememberRequestKey(request: NextRequest, key: string) {
  const requestKeys = consumedRequestKeys.get(request) ?? new Set<string>();
  requestKeys.add(key);
  consumedRequestKeys.set(request, requestKeys);
}

function hasConsumedRequestKey(request: NextRequest, key: string) {
  return consumedRequestKeys.get(request)?.has(key) ?? false;
}

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
    const [existing] = await tx
      .select({
        attempts: rateLimits.attempts,
        windowStartedAt: rateLimits.windowStartedAt,
        blockedUntil: rateLimits.blockedUntil,
      })
      .from(rateLimits)
      .where(eq(rateLimits.key, key))
      .for("update")
      .limit(1);

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

    if (existing.blockedUntil && existing.blockedUntil > now) {
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

  if (hasConsumedRequestKey(request, key)) {
    return null;
  }

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

  rememberRequestKey(request, key);
  return null;
}

/**
 * Consume one rate limit token keyed on authenticated user ID.
 * Use for authenticated API endpoints where IP-based limiting is insufficient
 * (shared IPs, VPNs). Returns a 429 response if rate limited, or null if allowed.
 *
 * Same two-tier strategy as {@link consumeApiRateLimit}.
 */
export async function consumeUserApiRateLimit(
  request: NextRequest,
  userId: string,
  endpoint: string,
): Promise<NextResponse | null> {
  const key = `api:${endpoint}:user:${userId}`;

  if (hasConsumedRequestKey(request, key)) {
    return null;
  }

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

  rememberRequestKey(request, key);
  return null;
}

/**
 * Check and record a rate limit for a server action.
 * Keyed on userId + actionName so each user has their own counter.
 * Returns { error: "rateLimited" } if the limit is exceeded, or null if allowed.
 */
export async function checkServerActionRateLimit(
  userId: string,
  actionName: string,
  maxRequests: number = 20,
  windowSeconds: number = 60,
): Promise<{ error: string } | null> {
  const key = `sa:${userId}:${actionName}`;
  const windowMs = windowSeconds * 1000;

  return execTransaction(async (tx) => {
    // Use DB server time for rate-limit window comparisons to avoid clock skew
    // between app and DB servers, consistent with other rate-limit checks
    // (realtime-coordination.ts, submissions.ts, assignment PATCH route).
    const now = (await getDbNowUncached()).getTime();
    const [existing] = await tx
      .select({
        attempts: rateLimits.attempts,
        windowStartedAt: rateLimits.windowStartedAt,
      })
      .from(rateLimits)
      .where(eq(rateLimits.key, key))
      .for("update")
      .limit(1);

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

    if (exists) {
      await tx.update(rateLimits)
        .set({ attempts: newAttempts, windowStartedAt, lastAttempt: now })
        .where(eq(rateLimits.key, key));
    } else {
      await tx.insert(rateLimits)
        .values({
          key,
          attempts: newAttempts,
          windowStartedAt,
          blockedUntil: null,
          consecutiveBlocks: 0,
          lastAttempt: now,
        });
    }

    return null;
  });
}

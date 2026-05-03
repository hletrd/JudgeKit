/**
 * Login/auth rate limiting backed by PostgreSQL.
 *
 * All timestamp comparisons use DB server time (getDbNowMs / getDbNowUncached)
 * to avoid clock skew between the app server and the database server. This
 * ensures consistency with api-rate-limit.ts, which writes to the same
 * rateLimits table using DB time.
 *
 * The in-memory limiter that previously lived next to this module was removed
 * (no production callers, and an authoritative rate limit that resets on
 * process restart is a security footgun). All rate limiting now flows through
 * this module or `./api-rate-limit.ts`, both DB-backed.
 */
import { db, execTransaction, type TransactionClient } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { extractClientIp } from "@/lib/security/ip";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { eq, lt } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getDbNowMs } from "@/lib/db-time";

function getRateLimitConfig() {
  const s = getConfiguredSettings();
  return {
    maxAttempts: s.loginRateLimitMaxAttempts,
    windowMs: s.loginRateLimitWindowMs,
    blockMs: s.loginRateLimitBlockMs,
  };
}

const RATE_LIMIT_EVICTION_AGE_MS = 24 * 60 * 60 * 1000;
const BACKOFF_CAP = 5; // max exponent: 2^5 = 32x

/**
 * Calculate the block duration using exponential backoff.
 * @param consecutiveBlocks - number of consecutive blocks (before this increment)
 * @param blockMs - base block duration in ms
 * @returns block duration in ms
 */
function calculateBlockDuration(consecutiveBlocks: number, blockMs: number): number {
  return blockMs * Math.pow(2, Math.min(consecutiveBlocks, BACKOFF_CAP));
}

export function getRateLimitKey(action: string, headers: Headers) {
  return `${action}:${extractClientIp(headers) ?? "unknown"}`;
}

export function getUsernameRateLimitKey(action: string, username: string) {
  return `${action}:user:${username.toLowerCase()}`;
}

async function evictStaleEntries() {
  // Use DB server time for cutoff to stay consistent with rate-limit writes
  // that use DB time (atomicConsumeRateLimit, checkServerActionRateLimit).
  const cutoff = await getDbNowMs() - RATE_LIMIT_EVICTION_AGE_MS;
  try {
    await db.delete(rateLimits).where(lt(rateLimits.lastAttempt, cutoff));
  } catch (err) {
    // Eviction is best-effort
    logger.warn({ err }, "[rate-limit] stale entry eviction failed");
  }
}

// Run eviction periodically instead of on every rate limit check
// to reduce write contention under load
const EVICTION_INTERVAL_MS = 60_000; // 1 minute
let evictionTimer: ReturnType<typeof setInterval> | null = null;

export function startRateLimitEviction() {
  if (evictionTimer) return;
  evictionTimer = setInterval(() => {
    void evictStaleEntries();
  }, EVICTION_INTERVAL_MS);
  // Allow the process to exit even if the timer is still active.
  // In Node.js, setInterval returns a Timeout object with unref();
  // in some environments (jsdom/Vitest) it returns a number.
  if (evictionTimer && typeof evictionTimer === "object" && "unref" in evictionTimer) {
    evictionTimer.unref();
  }
}

export function stopRateLimitEviction() {
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
}

async function getEntry(
  key: string,
  queryDb: Pick<typeof db, "select"> | Pick<TransactionClient, "select"> = db,
  nowMs?: number,
) {
  // Use DB server time for window/blocked-until comparisons to stay consistent
  // with rate-limit writes that use DB time (atomicConsumeRateLimit,
  // checkServerActionRateLimit). Callers that already have DB time should pass
  // it via nowMs to avoid an extra query.
  const now = nowMs ?? await getDbNowMs();
  const [existing] = await queryDb.select({
    attempts: rateLimits.attempts,
    windowStartedAt: rateLimits.windowStartedAt,
    blockedUntil: rateLimits.blockedUntil,
    consecutiveBlocks: rateLimits.consecutiveBlocks,
  }).from(rateLimits).where(eq(rateLimits.key, key)).limit(1).for("update");

  if (!existing) {
    return {
      now,
      entry: { attempts: 0, windowStartedAt: now, blockedUntil: 0, consecutiveBlocks: 0 },
      exists: false,
    };
  }

  if (existing.windowStartedAt + getRateLimitConfig().windowMs <= now) {
    return {
      now,
      entry: {
        attempts: 0,
        windowStartedAt: now,
        blockedUntil: existing.blockedUntil && existing.blockedUntil > now ? existing.blockedUntil : 0,
        consecutiveBlocks: existing.consecutiveBlocks ?? 0,
      },
      exists: true,
    };
  }

  return {
    now,
    entry: {
      attempts: existing.attempts,
      windowStartedAt: existing.windowStartedAt,
      blockedUntil: existing.blockedUntil ?? 0,
      consecutiveBlocks: existing.consecutiveBlocks ?? 0,
    },
    exists: true,
  };
}

/**
 * Check if a key is currently rate-limited (read-only).
 *
 * WARNING: This is a read-only status check — do NOT use it to gate write
 * operations. The check and any subsequent action run in separate transactions,
 * creating a TOCTOU race. For atomic check+increment, use
 * `consumeRateLimitAttemptMulti` instead.
 */
export async function isRateLimited(key: string) {
  return execTransaction(async (tx) => {
    const nowMs = await getDbNowMs();
    const { now, entry } = await getEntry(key, tx, nowMs);
    return entry.blockedUntil > now;
  });
}

/**
 * Check if any of the given keys is currently rate-limited (read-only).
 *
 * WARNING: This is a read-only status check — do NOT use it to gate write
 * operations. For atomic check+increment, use `consumeRateLimitAttemptMulti`
 * instead.
 */
export async function isAnyKeyRateLimited(...keys: string[]) {
  return execTransaction(async (tx) => {
    const nowMs = await getDbNowMs();
    const results = await Promise.all(keys.map(async (key) => {
      const { now, entry } = await getEntry(key, tx, nowMs);
      return entry.blockedUntil > now;
    }));
    return results.some(Boolean);
  });
}

/**
 * Atomically consume a login/auth attempt across one or more rate-limit keys.
 *
 * This closes the check-then-record race by performing the "is blocked?"
 * check and the attempt increment inside the same transaction/row lock set.
 *
 * Returns true when the request should be rejected immediately because at
 * least one key is already blocked or because this attempt hit the threshold.
 */
export async function consumeRateLimitAttemptMulti(...keys: string[]) {
  return execTransaction(async (tx) => {
    const config = getRateLimitConfig();
    // Fetch DB time once for all keys in this transaction to ensure consistency
    const nowMs = await getDbNowMs();
    const entries = await Promise.all(keys.map(async (key) => ({
      key,
      ...(await getEntry(key, tx, nowMs)),
    })));

    const hasActiveBlock = entries.some(({ now, entry }) => entry.blockedUntil > now);
    if (hasActiveBlock) {
      return true;
    }

    let shouldBlock = false;

    for (const { key, now, entry, exists } of entries) {
      const attempts = entry.attempts + 1;
      let blockedUntil = entry.blockedUntil;
      let consecutiveBlocks = entry.consecutiveBlocks;

      if (attempts >= config.maxAttempts) {
        consecutiveBlocks += 1;
        const blockMs = calculateBlockDuration(consecutiveBlocks - 1, config.blockMs);
        blockedUntil = now + blockMs;
        shouldBlock = true;
      }

      if (exists) {
        await tx.update(rateLimits).set({
          attempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil > 0 ? blockedUntil : null,
          consecutiveBlocks,
          lastAttempt: now,
        }).where(eq(rateLimits.key, key));
      } else {
        await tx.insert(rateLimits).values({
          key,
          attempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil > 0 ? blockedUntil : null,
          consecutiveBlocks,
          lastAttempt: now,
        });
      }
    }

    return shouldBlock;
  });
}

/**
 * Record a failed attempt for the given key.
 *
 * NOTE: This function is not atomic — the check (isRateLimited) and this
 * increment run in separate transactions. Callers that need check+increment
 * in one transaction should use `consumeRateLimitAttemptMulti` instead.
 */
export async function recordRateLimitFailure(key: string) {
  await execTransaction(async (tx) => {
    const nowMs = await getDbNowMs();
    const { now, entry, exists } = await getEntry(key, tx, nowMs);
    const attempts = entry.attempts + 1;

    let blockedUntil = entry.blockedUntil;
    let consecutiveBlocks = entry.consecutiveBlocks;

    const cfg = getRateLimitConfig();
    if (attempts >= cfg.maxAttempts) {
      consecutiveBlocks += 1;
      const blockDuration = calculateBlockDuration(consecutiveBlocks - 1, cfg.blockMs);
      blockedUntil = now + blockDuration;
    }

    if (exists) {
      await tx.update(rateLimits)
        .set({
          attempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil > 0 ? blockedUntil : null,
          consecutiveBlocks,
          lastAttempt: now,
        })
        .where(eq(rateLimits.key, key));
    } else {
      await tx.insert(rateLimits)
        .values({
          key,
          attempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil > 0 ? blockedUntil : null,
          consecutiveBlocks,
          lastAttempt: now,
        });
    }
  });
}

export async function recordRateLimitFailureMulti(...keys: string[]) {
  await execTransaction(async (tx) => {
    const nowMs = await getDbNowMs();
    for (const key of keys) {
      const { now, entry, exists } = await getEntry(key, tx, nowMs);
      const config = getRateLimitConfig();
      const newAttempts = entry.attempts + 1;
      let blockedUntil = entry.blockedUntil;
      let consecutiveBlocks = entry.consecutiveBlocks;

      if (newAttempts >= config.maxAttempts) {
        consecutiveBlocks += 1;
        const blockMs = calculateBlockDuration(consecutiveBlocks - 1, config.blockMs);
        blockedUntil = now + blockMs;
      }

      if (exists) {
        await tx.update(rateLimits).set({
          attempts: newAttempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil > 0 ? blockedUntil : null,
          consecutiveBlocks,
          lastAttempt: now,
        }).where(eq(rateLimits.key, key));
      } else {
        await tx.insert(rateLimits).values({
          key,
          attempts: newAttempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil > 0 ? blockedUntil : null,
          consecutiveBlocks,
          lastAttempt: now,
        });
      }
    }
  });
}

export async function clearRateLimit(key: string) {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

export async function clearRateLimitMulti(...keys: string[]) {
  await execTransaction(async (tx) => {
    for (const key of keys) {
      await tx.delete(rateLimits).where(eq(rateLimits.key, key));
    }
  });
}

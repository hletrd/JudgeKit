import { db, execTransaction, type TransactionClient } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { extractClientIp } from "@/lib/security/ip";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { eq, lt } from "drizzle-orm";
import { logger } from "@/lib/logger";

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
  const cutoff = Date.now() - RATE_LIMIT_EVICTION_AGE_MS;
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
  queryDb: Pick<typeof db, "select"> | Pick<TransactionClient, "select"> = db
) {
  const now = Date.now();
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

export async function isRateLimited(key: string) {
  return execTransaction(async (tx) => {
    const { now, entry } = await getEntry(key, tx);
    return entry.blockedUntil > now;
  });
}

export async function isAnyKeyRateLimited(...keys: string[]) {
  return execTransaction(async (tx) => {
    const results = await Promise.all(keys.map(async (key) => {
      const { now, entry } = await getEntry(key, tx);
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
    const entries = await Promise.all(keys.map(async (key) => ({
      key,
      ...(await getEntry(key, tx)),
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
    const { now, entry, exists } = await getEntry(key, tx);
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
    for (const key of keys) {
      const { now, entry, exists } = await getEntry(key, tx);
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

import { db, execTransaction, type TransactionClient } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { extractClientIp } from "@/lib/security/ip";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";

function getRateLimitConfig() {
  const s = getConfiguredSettings();
  return {
    maxAttempts: s.loginRateLimitMaxAttempts,
    windowMs: s.loginRateLimitWindowMs,
    blockMs: s.loginRateLimitBlockMs,
  };
}

/** @deprecated Use getConfiguredSettings().loginRateLimitMaxAttempts */
export const RATE_LIMIT_MAX_ATTEMPTS = getRateLimitConfig().maxAttempts;
/** @deprecated Use getConfiguredSettings().loginRateLimitWindowMs */
export const RATE_LIMIT_WINDOW_MS = getRateLimitConfig().windowMs;
/** @deprecated Use getConfiguredSettings().loginRateLimitBlockMs */
export const RATE_LIMIT_BLOCK_MS = getRateLimitConfig().blockMs;

const RATE_LIMIT_EVICTION_AGE_MS = 24 * 60 * 60 * 1000;

export function getRateLimitKey(action: string, headers: Headers) {
  return `${action}:${extractClientIp(headers)}`;
}

export function getUsernameRateLimitKey(action: string, username: string) {
  return `${action}:user:${username.toLowerCase()}`;
}

async function evictStaleEntries() {
  const cutoff = Date.now() - RATE_LIMIT_EVICTION_AGE_MS;
  try {
    await db.delete(rateLimits).where(lt(rateLimits.lastAttempt, cutoff));
  } catch {
    // Eviction is best-effort
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
  const [existing] = await queryDb.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1).for("update");

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

export async function recordRateLimitFailure(key: string) {
  await execTransaction(async (tx) => {
    const { now, entry, exists } = await getEntry(key, tx);
    const attempts = entry.attempts + 1;

    let blockedUntil = entry.blockedUntil;
    let consecutiveBlocks = entry.consecutiveBlocks;

    const cfg = getRateLimitConfig();
    if (attempts >= cfg.maxAttempts) {
      const multiplier = Math.pow(2, Math.min(consecutiveBlocks, 4));
      const blockDuration = cfg.blockMs * multiplier;
      blockedUntil = now + blockDuration;
      consecutiveBlocks += 1;
    }

    if (exists) {
      await tx.update(rateLimits)
        .set({
          attempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil || null,
          consecutiveBlocks,
          lastAttempt: now,
        })
        .where(eq(rateLimits.key, key));
    } else {
      await tx.insert(rateLimits)
        .values({
          id: nanoid(),
          key,
          attempts,
          windowStartedAt: entry.windowStartedAt,
          blockedUntil: blockedUntil || null,
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
        const blockMs = config.blockMs * Math.pow(2, Math.min(consecutiveBlocks - 1, 5));
        blockedUntil = now + blockMs;
      }

      if (exists) {
        await tx.update(rateLimits).set({
          attempts: newAttempts,
          windowStartedAt: entry.windowStartedAt === now ? now : entry.windowStartedAt,
          blockedUntil: blockedUntil > 0 ? blockedUntil : null,
          consecutiveBlocks,
          lastAttempt: now,
        }).where(eq(rateLimits.key, key));
      } else {
        await tx.insert(rateLimits).values({
          key,
          attempts: newAttempts,
          windowStartedAt: now,
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

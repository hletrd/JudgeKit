import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { extractClientIp } from "@/lib/security/ip";
import { eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";

const RATE_LIMIT_MAX_ATTEMPTS = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS || "5", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const RATE_LIMIT_BLOCK_MS = parseInt(process.env.RATE_LIMIT_BLOCK_MS || "900000", 10);
const RATE_LIMIT_EVICTION_AGE_MS = 24 * 60 * 60 * 1000;

export { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_BLOCK_MS };

export function getRateLimitKey(action: string, headers: Headers) {
  return `${action}:${extractClientIp(headers)}`;
}

export function getUsernameRateLimitKey(action: string, username: string) {
  return `${action}:user:${username.toLowerCase()}`;
}

function evictStaleEntries() {
  const cutoff = Date.now() - RATE_LIMIT_EVICTION_AGE_MS;
  try {
    db.delete(rateLimits).where(lt(rateLimits.lastAttempt, cutoff)).run();
  } catch {
    // Eviction is best-effort
  }
}

function getEntry(key: string) {
  const now = Date.now();
  const existing = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();

  if (!existing) {
    return {
      now,
      entry: { attempts: 0, windowStartedAt: now, blockedUntil: 0, consecutiveBlocks: 0 },
      exists: false,
    };
  }

  if (existing.windowStartedAt + RATE_LIMIT_WINDOW_MS <= now) {
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

export function isRateLimited(key: string) {
  const { now, entry } = getEntry(key);

  if (entry.blockedUntil > now) {
    return true;
  }

  return false;
}

export function isAnyKeyRateLimited(...keys: string[]) {
  return keys.some((key) => isRateLimited(key));
}

export function recordRateLimitFailure(key: string) {
  const { now, entry, exists } = getEntry(key);
  const attempts = entry.attempts + 1;

  let blockedUntil = entry.blockedUntil;
  let consecutiveBlocks = entry.consecutiveBlocks;

  if (attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    // Escalating backoff: 2^consecutiveBlocks multiplier, capped at 2^4 = 16x (~4 hours)
    const multiplier = Math.pow(2, Math.min(consecutiveBlocks, 4));
    const blockDuration = RATE_LIMIT_BLOCK_MS * multiplier;
    blockedUntil = now + blockDuration;
    consecutiveBlocks += 1;
  }

  if (exists) {
    db.update(rateLimits)
      .set({
        attempts,
        windowStartedAt: entry.windowStartedAt,
        blockedUntil: blockedUntil || null,
        consecutiveBlocks,
        lastAttempt: now,
      })
      .where(eq(rateLimits.key, key))
      .run();
  } else {
    db.insert(rateLimits)
      .values({
        id: nanoid(),
        key,
        attempts,
        windowStartedAt: entry.windowStartedAt,
        blockedUntil: blockedUntil || null,
        consecutiveBlocks,
        lastAttempt: now,
      })
      .run();
  }

  evictStaleEntries();
}

export function recordRateLimitFailureMulti(...keys: string[]) {
  for (const key of keys) {
    recordRateLimitFailure(key);
  }
}

export function clearRateLimit(key: string) {
  db.delete(rateLimits).where(eq(rateLimits.key, key)).run();
}

export function clearRateLimitMulti(...keys: string[]) {
  for (const key of keys) {
    clearRateLimit(key);
  }
}

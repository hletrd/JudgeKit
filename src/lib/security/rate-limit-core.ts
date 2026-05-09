/**
 * Shared rate-limit database primitives.
 *
 * Both `./rate-limit.ts` (login/auth) and `./api-rate-limit.ts` (API routes)
 * read from and write to the same `rateLimits` table. This module extracts
 * the common SELECT FOR UPDATE pattern and window-expiry check so that bug
 * fixes in the core read path propagate to both consumers.
 *
 * Each consumer still controls its own semantics (exponential backoff vs
 * fixed window, blocked-until computation, response formatting) because those
 * differ by use case.
 */
import { type TransactionClient } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface RateLimitRow {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number | null;
  consecutiveBlocks: number;
  lastAttempt: number;
}

/**
 * Fetch a rate-limit entry with SELECT FOR UPDATE to prevent TOCTOU races.
 * Returns `null` if no entry exists for the given key.
 */
export async function fetchRateLimitEntry(
  tx: Pick<TransactionClient, "select">,
  key: string
): Promise<RateLimitRow | null> {
  const [existing] = await tx
    .select({
      attempts: rateLimits.attempts,
      windowStartedAt: rateLimits.windowStartedAt,
      blockedUntil: rateLimits.blockedUntil,
      consecutiveBlocks: rateLimits.consecutiveBlocks,
      lastAttempt: rateLimits.lastAttempt,
    })
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .for("update")
    .limit(1);

  if (!existing) return null;

  return {
    attempts: existing.attempts,
    windowStartedAt: existing.windowStartedAt,
    blockedUntil: existing.blockedUntil,
    consecutiveBlocks: existing.consecutiveBlocks ?? 0,
    lastAttempt: existing.lastAttempt,
  };
}

/**
 * Check whether a rate-limit window has expired.
 */
export function isRateLimitWindowExpired(
  windowStartedAt: number,
  windowMs: number,
  now: number
): boolean {
  return windowStartedAt + windowMs <= now;
}

/**
 * Upsert a rate-limit entry inside a transaction.
 * Uses INSERT when `exists` is false, UPDATE when true.
 */
export async function upsertRateLimitEntry(
  tx: Pick<TransactionClient, "insert" | "update">,
  key: string,
  data: {
    attempts: number;
    windowStartedAt: number;
    blockedUntil: number | null;
    consecutiveBlocks: number;
    lastAttempt: number;
  },
  exists: boolean
): Promise<void> {
  if (exists) {
    await tx
      .update(rateLimits)
      .set({
        attempts: data.attempts,
        windowStartedAt: data.windowStartedAt,
        blockedUntil: data.blockedUntil,
        consecutiveBlocks: data.consecutiveBlocks,
        lastAttempt: data.lastAttempt,
      })
      .where(eq(rateLimits.key, key));
  } else {
    await tx.insert(rateLimits).values({
      key,
      attempts: data.attempts,
      windowStartedAt: data.windowStartedAt,
      blockedUntil: data.blockedUntil,
      consecutiveBlocks: data.consecutiveBlocks,
      lastAttempt: data.lastAttempt,
    });
  }
}

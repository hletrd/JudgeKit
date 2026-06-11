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

export interface RateLimitEntryData {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number | null;
  consecutiveBlocks: number;
  lastAttempt: number;
}

/**
 * Insert a rate-limit row only if absent (`ON CONFLICT (key) DO NOTHING`).
 *
 * Returns true when THIS call created the row, false when a concurrent
 * transaction won the first-insert race. Why this exists (RPF cycle-2
 * AGG2-3): when no row exists for a key, `fetchRateLimitEntry`'s
 * `SELECT ... FOR UPDATE` locks nothing, so two concurrent first hits both
 * reach the INSERT — without the conflict clause the loser threw a
 * unique-violation that aborted the transaction and surfaced as a 500 in
 * the middle of the rate-limit control. On a `false` return, callers must
 * re-read with `fetchRateLimitEntry` (the row exists now, so FOR UPDATE
 * blocks until the winner commits) and take their normal update path.
 */
export async function insertRateLimitEntryIfAbsent(
  tx: Pick<TransactionClient, "insert">,
  key: string,
  data: RateLimitEntryData
): Promise<boolean> {
  const result = await tx
    .insert(rateLimits)
    .values({
      key,
      attempts: data.attempts,
      windowStartedAt: data.windowStartedAt,
      blockedUntil: data.blockedUntil,
      consecutiveBlocks: data.consecutiveBlocks,
      lastAttempt: data.lastAttempt,
    })
    .onConflictDoNothing({ target: rateLimits.key });
  return Number((result as { rowCount?: number | null }).rowCount ?? 0) > 0;
}

/**
 * Upsert a rate-limit entry inside a transaction.
 * Uses INSERT when `exists` is false, UPDATE when true.
 *
 * The insert branch is conflict-safe: when a concurrent transaction wins the
 * first-insert race, the caller's intended state is applied via UPDATE
 * instead (blocking on the winner's row lock until it commits). The two
 * racing first attempts collapse into the caller's computed state — at worst
 * one attempt is undercounted, never a thrown duplicate-key 500 (AGG2-3).
 */
export async function upsertRateLimitEntry(
  tx: Pick<TransactionClient, "insert" | "update">,
  key: string,
  data: RateLimitEntryData,
  exists: boolean
): Promise<void> {
  if (!exists) {
    const inserted = await insertRateLimitEntryIfAbsent(tx, key, data);
    if (inserted) return;
  }
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
}

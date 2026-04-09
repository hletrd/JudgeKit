/**
 * Fast in-memory rate limiter using Map with automatic eviction.
 * Replaces SQLite queries for rate limiting in high-throughput paths.
 * Falls back gracefully — if the process restarts, all limits reset (acceptable trade-off).
 */

import { extractClientIp } from "@/lib/security/ip";

interface RateLimitEntry {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number | null;
  consecutiveBlocks: number;
  lastAttempt: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_ENTRIES = 10000;
const EVICTION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Periodic eviction (runs every 60 seconds)
let lastEviction = Date.now();
function maybeEvict() {
  const now = Date.now();
  if (now - lastEviction < 60_000) return;
  lastEviction = now;
  for (const [key, entry] of store) {
    if (now - entry.lastAttempt > EVICTION_AGE_MS) {
      store.delete(key);
    }
  }
  // FIFO eviction if over capacity
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    const keys = store.keys();
    for (let i = 0; i < excess; i++) {
      const { value } = keys.next();
      if (value) store.delete(value);
    }
  }
}

export function isRateLimitedInMemory(
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  maybeEvict();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) return false;

  // Check if blocked
  if (entry.blockedUntil && entry.blockedUntil > now) return true;

  // Check if window expired
  if (entry.windowStartedAt + windowMs <= now) return false;

  return entry.attempts >= maxAttempts;
}

export function recordAttemptInMemory(
  key: string,
  windowMs: number
): void {
  maybeEvict();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.windowStartedAt + windowMs <= now) {
    store.set(key, {
      attempts: 1,
      windowStartedAt: now,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: now,
    });
    return;
  }

  entry.attempts++;
  entry.lastAttempt = now;
}

export function recordFailureInMemory(
  key: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number
): { blocked: boolean; blockedUntil: number | null } {
  maybeEvict();
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || entry.windowStartedAt + windowMs <= now) {
    entry = {
      attempts: 1,
      windowStartedAt: now,
      blockedUntil: null,
      consecutiveBlocks: 0,
      lastAttempt: now,
    };
    store.set(key, entry);
    return { blocked: false, blockedUntil: null };
  }

  entry.attempts++;
  entry.lastAttempt = now;

  if (entry.attempts >= maxAttempts) {
    const MAX_BLOCK = 24 * 60 * 60 * 1000;
    const duration = Math.min(blockMs * Math.pow(2, entry.consecutiveBlocks), MAX_BLOCK);
    entry.blockedUntil = now + duration;
    entry.consecutiveBlocks++;
    return { blocked: true, blockedUntil: entry.blockedUntil };
  }

  return { blocked: false, blockedUntil: null };
}

export function resetInMemory(key: string): void {
  store.delete(key);
}

/**
 * Drop-in replacement for consumeApiRateLimit that uses in-memory store.
 * Returns a NextResponse if rate limited, or null if allowed.
 */
export function consumeInMemoryRateLimit(
  request: { headers: { get(name: string): string | null } },
  action: string,
  maxAttempts: number = 30,
  windowMs: number = 60000
): { limited: boolean; retryAfter?: number } {
  const ip = extractClientIp(request.headers) || "unknown";
  const key = `${action}:${ip}`;

  if (isRateLimitedInMemory(key, maxAttempts, windowMs)) {
    const entry = store.get(key);
    const retryAfter = entry?.blockedUntil
      ? Math.ceil((entry.blockedUntil - Date.now()) / 1000)
      : Math.ceil(windowMs / 1000);
    return { limited: true, retryAfter };
  }

  recordAttemptInMemory(key, windowMs);
  return { limited: false };
}

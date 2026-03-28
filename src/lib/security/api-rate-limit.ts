import { NextRequest, NextResponse } from "next/server";
import { getRateLimitKey, isRateLimited } from "./rate-limit";
import { db, sqlite } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { getConfiguredSettings } from "@/lib/system-settings-config";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

function getApiRateLimitConfig() {
  const s = getConfiguredSettings();
  return { max: s.apiRateLimitMax, windowMs: s.apiRateLimitWindowMs };
}

/** @deprecated Use getConfiguredSettings().apiRateLimitMax */
export const API_RATE_LIMIT_MAX = getApiRateLimitConfig().max;
/** @deprecated Use getConfiguredSettings().apiRateLimitWindowMs */
export const API_RATE_LIMIT_WINDOW_MS = getApiRateLimitConfig().windowMs;

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
 * Record an API request attempt without escalating backoff.
 * Unlike recordRateLimitFailure, this simply increments the counter
 * without applying exponential blocking on threshold breach.
 */
function recordApiAttempt(key: string) {
  sqlite.transaction(() => {
    const now = Date.now();
    const existing = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();

    const { max: apiMax, windowMs } = getApiRateLimitConfig();

    if (!existing) {
      db.insert(rateLimits)
        .values({
          id: nanoid(),
          key,
          attempts: 1,
          windowStartedAt: now,
          blockedUntil: null,
          consecutiveBlocks: 0,
          lastAttempt: now,
        })
        .run();
      return;
    }

    if (existing.windowStartedAt + windowMs <= now) {
      // Window expired, reset
      db.update(rateLimits)
        .set({ attempts: 1, windowStartedAt: now, lastAttempt: now })
        .where(eq(rateLimits.key, key))
        .run();
      return;
    }

    // Simply increment without escalating backoff
    const blocked = existing.attempts + 1 >= apiMax
      ? now + windowMs
      : null;

    db.update(rateLimits)
      .set({
        attempts: existing.attempts + 1,
        lastAttempt: now,
        blockedUntil: blocked,
      })
      .where(eq(rateLimits.key, key))
      .run();
  })();
}

function rateLimitedResponse() {
  return NextResponse.json(
    { error: "rateLimited" },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}

/**
 * Consume one rate limit token for a mutation endpoint.
 * Returns a 429 response if rate limited, or null if allowed.
 */
export function consumeApiRateLimit(
  request: NextRequest,
  endpoint: string
): NextResponse | null {
  const key = getRateLimitKey(`api:${endpoint}`, request.headers);

  if (hasConsumedRequestKey(request, key)) {
    return null;
  }

  if (isRateLimited(key)) {
    return rateLimitedResponse();
  }

  recordApiAttempt(key);
  rememberRequestKey(request, key);

  return null;
}

/**
 * Consume one rate limit token keyed on authenticated user ID.
 * Use for authenticated API endpoints where IP-based limiting is insufficient
 * (shared IPs, VPNs). Returns a 429 response if rate limited, or null if allowed.
 */
export function consumeUserApiRateLimit(
  request: NextRequest,
  userId: string,
  endpoint: string,
): NextResponse | null {
  const key = `api:${endpoint}:user:${userId}`;

  if (hasConsumedRequestKey(request, key)) {
    return null;
  }

  if (isRateLimited(key)) {
    return rateLimitedResponse();
  }

  recordApiAttempt(key);
  rememberRequestKey(request, key);

  return null;
}

/**
 * Check and record a rate limit for a server action.
 * Keyed on userId + actionName so each user has their own counter.
 * Returns { error: "rateLimited" } if the limit is exceeded, or null if allowed.
 */
export function checkServerActionRateLimit(
  userId: string,
  actionName: string,
  maxRequests: number = 20,
  windowSeconds: number = 60,
): { error: string } | null {
  const key = `sa:${userId}:${actionName}`;
  const windowMs = windowSeconds * 1000;

  return sqlite.transaction(() => {
    const now = Date.now();
    const existing = db.select().from(rateLimits).where(eq(rateLimits.key, key)).get();

    let attempts: number;
    let windowStartedAt: number;
    let exists: boolean;

    if (!existing) {
      attempts = 0;
      windowStartedAt = now;
      exists = false;
    } else if (existing.windowStartedAt + windowMs <= now) {
      // Window has expired — reset
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
      db.update(rateLimits)
        .set({ attempts: newAttempts, windowStartedAt, lastAttempt: now })
        .where(eq(rateLimits.key, key))
        .run();
    } else {
      db.insert(rateLimits)
        .values({
          id: nanoid(),
          key,
          attempts: newAttempts,
          windowStartedAt,
          blockedUntil: null,
          consecutiveBlocks: 0,
          lastAttempt: now,
        })
        .run();
    }

    return null;
  })();
}

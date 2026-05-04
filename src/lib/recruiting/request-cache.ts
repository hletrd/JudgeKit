import { AsyncLocalStorage } from "async_hooks";
import { logger } from "@/lib/logger";

/**
 * Per-request cache for recruiting access context.
 *
 * React `cache()` only deduplicates within a single RSC render, but API route
 * handlers are outside the React rendering lifecycle. This AsyncLocalStorage
 * cache bridges the gap by providing request-scoped caching that works in both
 * RSC and API route contexts.
 *
 * In Next.js, each incoming request creates a new async context, so the store
 * is naturally scoped to a single request. No explicit cleanup is needed.
 *
 * Usage:
 *   const ctx = getCachedRecruitingContext(userId);
 *   if (ctx) return ctx;  // cache hit
 *   const result = await loadRecruitingAccessContext(userId);
 *   setCachedRecruitingContext(userId, result);
 *   return result;
 */

type CachedContext = {
  userId: string;
  context: import("./access").RecruitingAccessContext;
};

const recruitingContextStore = new AsyncLocalStorage<CachedContext>();

/**
 * Retrieve the cached recruiting access context for the current request, if any.
 */
export function getCachedRecruitingContext(userId: string): import("./access").RecruitingAccessContext | undefined {
  const store = recruitingContextStore.getStore();
  if (store && store.userId === userId) {
    return store.context;
  }
  return undefined;
}

/**
 * Store the recruiting access context for the current request.
 *
 * **Single-user constraint:** The cache holds exactly one user's context per
 * request. Calling this with a different userId silently overwrites the
 * previous context. This is acceptable for the current single-user-per-request
 * pattern (each API request checks access for exactly one authenticated user).
 * If multi-user access within a single request becomes needed, refactor to a
 * Map<string, RecruitingAccessContext>.
 */
export function setCachedRecruitingContext(
  userId: string,
  context: import("./access").RecruitingAccessContext
): void {
  // AsyncLocalStorage.getStore() returns undefined if no store is active.
  // We cannot set a value if there's no active ALS context, but in Next.js
  // every request has an ALS context by default. If we're outside one,
  // the cache simply doesn't apply (graceful degradation).
  const store = recruitingContextStore.getStore();
  if (store) {
    store.userId = userId;
    store.context = context;
  } else if (process.env.NODE_ENV !== "production") {
    logger.warn("[request-cache] Cannot cache recruiting context — no active ALS store. Ensure withRecruitingContextCache is called in the request pipeline.");
  }
}

/**
 * Run a function within a new recruiting context store.
 * Used by middleware or request wrappers to initialize the per-request cache.
 *
 * Note: In Next.js, AsyncLocalStorage is automatically scoped per-request
 * because the framework creates a new ALS context for each incoming request.
 * This explicit run() is only needed if you want to guarantee a fresh store
 * regardless of whether Next.js has already set one up.
 */
export function withRecruitingContextCache<T>(fn: () => T): T {
  return recruitingContextStore.run({ userId: "", context: undefined as unknown as import("./access").RecruitingAccessContext }, fn);
}

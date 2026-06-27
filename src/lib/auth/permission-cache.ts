import { AsyncLocalStorage } from "async_hooks";
import { logger } from "@/lib/logger";

/**
 * Per-request memoization for permission/scope checks (e.g. `canManageProblem`).
 *
 * React `cache()` only deduplicates within a single RSC render, and many
 * permission checks run inside API route handlers (outside the RSC lifecycle).
 * This AsyncLocalStorage cache mirrors the proven pattern in
 * `src/lib/recruiting/request-cache.ts`: it provides request-scoped memoization
 * that works in both RSC and API-route contexts, so a handler that resolves the
 * same `(userId, problemId)` scope multiple times in one request hits the DB
 * once instead of N times.
 *
 * In Next.js each incoming request creates a new async context, so the store is
 * naturally scoped to a single request. No explicit cleanup is needed.
 *
 * Graceful degradation: if no store is active (the caller is outside a
 * `withPermissionCache` wrapper — e.g. an RSC page or a background job), the
 * getters/setters no-op and the permission function simply recomputes. The
 * RESULT is always correct; only performance varies. This is what makes the
 * memo safe to add to cross-cutting resolvers: a missing store can never
 * produce a stale or wrong verdict.
 */

const permissionStore = new AsyncLocalStorage<Map<string, boolean>>();

/**
 * Run a function within a fresh per-request permission cache. Wrapped by the
 * API handler (`src/lib/api/handler.ts`) around every request so all permission
 * checks inside the handler share one memo. Nesting is safe — each `run` gets
 * its own independent `Map`.
 */
export function withPermissionCache<T>(fn: () => T): T {
  return permissionStore.run(new Map(), fn);
}

/**
 * Read a cached permission verdict for the given key, if a store is active.
 * Returns `undefined` when there is no active store (graceful degradation) or
 * when the key has not been resolved yet.
 */
export function getCachedPermission(key: string): boolean | undefined {
  return permissionStore.getStore()?.get(key);
}

/**
 * Store a permission verdict for the given key under the active store.
 * No-ops when no store is active (graceful degradation). A `false` verdict is
 * cached just like a `true` verdict — both are correct, deterministic results
 * for an immutable `(role, userId, resourceId)` triple within one request.
 */
export function setCachedPermission(key: string, value: boolean): void {
  const store = permissionStore.getStore();
  if (store) {
    store.set(key, value);
  } else if (process.env.NODE_ENV !== "production") {
    logger.warn(
      "[permission-cache] Cannot cache permission verdict — no active ALS store. Ensure withPermissionCache is called in the request pipeline."
    );
  }
}

/**
 * Build a cache key from the components that uniquely identify a permission
 * verdict. Centralised so callers cannot accidentally omit a component and
 * collide entries.
 */
export function permissionKey(
  scope: string,
  userId: string,
  resourceId: string
): string {
  return `${scope}:${userId}:${resourceId}`;
}

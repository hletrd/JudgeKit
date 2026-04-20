/**
 * Drizzle ORM update helpers.
 *
 * Drizzle's `$defaultFn` only runs on INSERT, not UPDATE.
 * Use `withUpdatedAt()` to automatically inject `updatedAt` into
 * every `.set()` call so that no update silently leaves the timestamp stale.
 *
 * By default, uses `new Date()` (app server clock). For routes that have
 * already fetched DB time via `getDbNowUncached()`, pass it as the second
 * argument to keep timestamps consistent with the DB-time migration.
 *
 * @example
 *   await db.update(users).set(withUpdatedAt({ name: "Alice" })).where(eq(users.id, id));
 *   await db.update(users).set(withUpdatedAt({ name: "Alice" }, await getDbNowUncached())).where(eq(users.id, id));
 */
export function withUpdatedAt<T extends Record<string, unknown>>(
  data: T,
  now?: Date
): T & { updatedAt: Date } {
  return { ...data, updatedAt: now ?? new Date() };
}

import { cache } from "react";
import { rawQueryOne } from "@/lib/db/queries";

/**
 * Fetch the current time from the PostgreSQL server.
 *
 * Use this instead of `new Date()` for temporal comparisons (expiry, deadline)
 * in server components and API routes to avoid clock skew between the app
 * server and the database server. The DB server's time is the authoritative
 * source for all stored timestamps.
 *
 * Wrapped in React.cache() so that a single server render shares one DB query.
 *
 * Throws if the DB query returns null (e.g., connectivity failure) rather than
 * silently falling back to app-server time, which would defeat the purpose of
 * this utility.
 */
export const getDbNow = cache(async function getDbNow(): Promise<Date> {
  const row = await rawQueryOne<{ now: Date }>("SELECT NOW()::timestamptz AS now");
  if (!row?.now) {
    throw new Error("getDbNow: failed to fetch DB server time — SELECT NOW() returned null");
  }
  return row.now;
});

/**
 * Fetch the current time from the PostgreSQL server without React.cache().
 *
 * Use this in non-React contexts (API route middleware, server actions called
 * outside a React render, utility functions) where React.cache() is not available.
 * Prefer `getDbNow()` in React server components for automatic deduplication.
 */
export async function getDbNowUncached(): Promise<Date> {
  const row = await rawQueryOne<{ now: Date }>("SELECT NOW()::timestamptz AS now");
  if (!row?.now) {
    throw new Error("getDbNowUncached: failed to fetch DB server time — SELECT NOW() returned null");
  }
  return row.now;
}

/**
 * Fetch the current time from the PostgreSQL server as milliseconds since epoch.
 *
 * Convenience wrapper for the common pattern `(await getDbNowUncached()).getTime()`.
 * Use this for DB timestamp comparisons in transactional code (rate limits, claim
 * times, deadlines, etc.) to avoid clock skew between the app server and the
 * database server. Not intended for non-DB comparisons such as container lifecycle
 * or in-process staleness checks where raw `Date.now()` is appropriate.
 *
 * @see getDbNowUncached for the underlying Date-returning version
 */
export async function getDbNowMs(): Promise<number> {
  return (await getDbNowUncached()).getTime();
}

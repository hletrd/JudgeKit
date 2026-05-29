import type { Session } from "next-auth";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authUserSelect } from "@/lib/db/selects";

/**
 * Column selection for password-verification flows.
 * Extends authUserSelect with passwordHash; all other columns are derived
 * from the shared constant so new preference fields are included automatically.
 */
const authUserWithPasswordColumns = {
  ...authUserSelect,
  passwordHash: users.passwordHash,
};

export function hasSessionIdentity(session: Session | null) {
  return Boolean(session?.user?.id || session?.user?.username);
}

/**
 * Find the session user with safe column selection (excludes passwordHash).
 * For password verification, use findSessionUserWithPassword() instead.
 *
 * Returns `null` (never `undefined`) when no matching user row exists, matching
 * the not-found contract of findSessionUserWithPassword. The `?? null` on each
 * branch normalizes Drizzle's `[0]` (which is `undefined` for an empty result)
 * so callers can rely on a single sentinel.
 */
export async function findSessionUser(session: Session | null) {
  const sessionUser = session?.user;

  if (!hasSessionIdentity(session)) {
    return null;
  }

  if (sessionUser?.id) {
    return (await db.select(authUserSelect).from(users).where(eq(users.id, sessionUser.id)).limit(1))[0] ?? null;
  }

  if (sessionUser?.username) {
    return (await db.select(authUserSelect).from(users).where(sql`lower(${users.username}) = lower(${sessionUser.username})`).limit(1))[0] ?? null;
  }

  return null;
}

/**
 * Find the session user including passwordHash for credential verification.
 * Uses db.select() with authUserWithPasswordColumns so the column set stays
 * in sync with authUserSelect — adding a field to authUserSelect automatically
 * includes it here too.
 */
export async function findSessionUserWithPassword(session: Session | null) {
  const sessionUser = session?.user;

  if (!hasSessionIdentity(session)) {
    return null;
  }

  if (sessionUser?.id) {
    return (await db.select(authUserWithPasswordColumns).from(users).where(eq(users.id, sessionUser.id)).limit(1))[0] ?? null;
  }

  if (sessionUser?.username) {
    return (await db.select(authUserWithPasswordColumns).from(users).where(sql`lower(${users.username}) = lower(${sessionUser.username})`).limit(1))[0] ?? null;
  }

  return null;
}

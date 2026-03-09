import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { authUserSelect } from "@/lib/db/selects";

export function hasSessionIdentity(session: Session | null) {
  return Boolean(session?.user?.id || session?.user?.username);
}

/**
 * Find the session user with safe column selection (excludes passwordHash).
 * For password verification, use findSessionUserWithPassword() instead.
 */
export async function findSessionUser(session: Session | null) {
  const sessionUser = session?.user;

  if (!hasSessionIdentity(session)) {
    return null;
  }

  if (sessionUser?.id) {
    return db.select(authUserSelect).from(users).where(eq(users.id, sessionUser.id)).get();
  }

  if (sessionUser?.username) {
    return db.select(authUserSelect).from(users).where(eq(users.username, sessionUser.username)).get();
  }

  return null;
}

/**
 * Find the session user including passwordHash for credential verification.
 */
export async function findSessionUserWithPassword(session: Session | null) {
  const sessionUser = session?.user;

  if (!hasSessionIdentity(session)) {
    return null;
  }

  if (sessionUser?.id) {
    return db.query.users.findFirst({
      where: eq(users.id, sessionUser.id),
    });
  }

  if (sessionUser?.username) {
    return db.query.users.findFirst({
      where: eq(users.username, sessionUser.username),
    });
  }

  return null;
}

import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export function hasSessionIdentity(session: Session | null) {
  return Boolean(session?.user?.id || session?.user?.username);
}

export async function findSessionUser(session: Session | null) {
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

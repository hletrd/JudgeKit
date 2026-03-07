"use server";

import { hash, compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { findSessionUser, hasSessionIdentity } from "@/lib/auth/find-session-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();

  if (!hasSessionIdentity(session)) {
    return { success: false, error: "sessionExpired" };
  }

  const user = await findSessionUser(session);

  if (!user || !user.passwordHash) {
    return { success: false, error: "sessionExpired" };
  }

  const isValid = await compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return { success: false, error: "currentPasswordIncorrect" };
  }

  if (newPassword.length < 8) {
    return { success: false, error: "passwordTooShort" };
  }

  const newHash = await hash(newPassword, 12);

  db.update(users)
    .set({
      passwordHash: newHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .run();

  return { success: true };
}

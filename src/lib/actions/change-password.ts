"use server";

import { hashPassword, verifyPassword } from "@/lib/security/password-hash";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { findSessionUserWithPassword, hasSessionIdentity } from "@/lib/auth/find-session-user";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { getDbNowUncached } from "@/lib/db-time";
import { clearRateLimit, consumeRateLimitAttemptMulti } from "@/lib/security/rate-limit";
import { getPasswordValidationError } from "@/lib/security/password";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { logger } from "@/lib/logger";

function getChangePasswordRateLimitKey(userId: string) {
  return `change-password:user:${userId}`;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();

  if (!hasSessionIdentity(session)) {
    return { success: false, error: "sessionExpired" };
  }

  const user = await findSessionUserWithPassword(session);

  if (!user || !user.passwordHash) {
    return { success: false, error: "sessionExpired" };
  }

  const rateLimitKey = getChangePasswordRateLimitKey(user.id);

  // Atomic check+increment: consumes one rate-limit attempt inside the same
  // transaction that checks the threshold. This closes the TOCTOU race that
  // existed when isRateLimited() and recordRateLimitFailure() were called
  // as separate transactions.
  if (await consumeRateLimitAttemptMulti(rateLimitKey)) {
    return { success: false, error: "changePasswordRateLimited" };
  }

  // needsRehash is intentionally not handled here: the user is about to set
  // a new password which will be hashed with argon2id via hashPassword() below.
  // There is no benefit to rehashing the current password when it is about to
  // be replaced.
  const { valid: isValid } = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    return { success: false, error: "currentPasswordIncorrect" };
  }

  const passwordValidationError = getPasswordValidationError(newPassword);

  if (passwordValidationError) {
    return { success: false, error: passwordValidationError };
  }

  const newHash = await hashPassword(newPassword);

  try {
    const now = await getDbNowUncached();
    await db.update(users)
      .set(withUpdatedAt({
        passwordHash: newHash,
        mustChangePassword: false,
        tokenInvalidatedAt: now,
      }, now))
      .where(eq(users.id, user.id));
  } catch (error) {
    logger.error({ err: error }, "Failed to change password");
    return { success: false, error: "error" };
  }

  await clearRateLimit(rateLimitKey);

  const auditContext = await buildServerActionAuditContext("/change-password");
  recordAuditEvent({
    actorId: user.id,
    actorRole: user.role,
    action: "user.password_changed",
    resourceType: "user",
    resourceId: user.id,
    resourceLabel: user.username,
    summary: `Changed password for @${user.username}`,
    details: {
      invalidatedExistingSessions: true,
      mustChangePassword: false,
    },
    context: auditContext,
  });

  return { success: true };
}

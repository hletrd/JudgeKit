/**
 * JudgeKit Email Service
 *
 * High-level email operations built on the SMTP transport.
 * Provides rate-limited sending for transactional emails.
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import { users, passwordResetTokens, emailVerificationTokens } from "@/lib/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { sendEmail, isEmailConfigured } from "@/lib/email/smtp";
import {
  renderPasswordResetEmail,
  renderEmailVerificationEmail,
  renderSiteEventEmail,
} from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { hashPassword } from "@/lib/security/password-hash";
import { getDbNowUncached } from "@/lib/db-time";

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateSecureToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export interface SendPasswordResetResult {
  success: boolean;
  error?: "email_not_configured" | "user_not_found" | "no_email" | "rate_limited" | "send_failed";
}

export async function sendPasswordResetEmail(
  email: string,
  baseUrl: string
): Promise<SendPasswordResetResult> {
  if (!(await isEmailConfigured())) {
    return { success: false, error: "email_not_configured" };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return { success: false, error: "user_not_found" };
  }

  if (!user.email) {
    return { success: false, error: "no_email" };
  }

  const userEmail = user.email;
  const { token, hash } = generateSecureToken();
  const dbNow = await getDbNowUncached();
  const expiresAt = new Date(dbNow.getTime() + PASSWORD_RESET_EXPIRY_MS);

  // Atomic delete+insert so an insert failure never leaves the user token-less
  await db.transaction(async (tx) => {
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hash,
      expiresAt,
    });
  });

  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const template = await renderPasswordResetEmail({
    to: user.email,
    resetUrl,
    expiresInMinutes: 60,
  });

  const result = await sendEmail({
    to: user.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  if (!result.success) {
    logger.error({ email, error: result.error }, "Failed to send password reset email");
    return { success: false, error: "send_failed" };
  }

  return { success: true };
}

export interface ValidateResetTokenResult {
  valid: boolean;
  userId?: string;
}

export async function validatePasswordResetToken(token: string): Promise<ValidateResetTokenResult> {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const now = await getDbNowUncached();

  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hash),
      gt(passwordResetTokens.expiresAt, now),
      isNull(passwordResetTokens.usedAt)
    ),
  });

  if (!row) {
    return { valid: false };
  }

  return { valid: true, userId: row.userId };
}

export interface ResetPasswordResult {
  success: boolean;
  error?: "invalid_token" | "password_too_short" | "already_used";
}

export async function resetPassword(
  token: string,
  newPassword: string,
  minLength: number = 8
): Promise<ResetPasswordResult> {
  if (newPassword.length < minLength) {
    return { success: false, error: "password_too_short" };
  }

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const now = await getDbNowUncached();

  try {
    await db.transaction(async (tx) => {
      // Read token inside transaction to prevent TOCTOU races where a
      // concurrent request marks the token used between our read and write.
      const row = await tx.query.passwordResetTokens.findFirst({
        where: and(
          eq(passwordResetTokens.tokenHash, hash),
          gt(passwordResetTokens.expiresAt, now)
        ),
      });

      if (!row) {
        throw new Error("invalid_token");
      }

      if (row.usedAt) {
        throw new Error("already_used");
      }

      const passwordHash = await hashPassword(newPassword);

      // Update token first with a conditional WHERE that checks usedAt IS NULL.
      // Under READ COMMITTED this serializes: if another transaction already
      // consumed the token, our WHERE will see usedAt is set and rowCount=0.
      const tokenUpdate = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.id, row.id),
            isNull(passwordResetTokens.usedAt)
          )
        );

      if ((tokenUpdate.rowCount ?? 0) === 0) {
        throw new Error("already_used");
      }

      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: now })
        .where(eq(users.id, row.userId));

      logger.info({ userId: row.userId }, "Password reset completed");
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === "invalid_token") {
        return { success: false, error: "invalid_token" };
      }
      if (err.message === "already_used") {
        return { success: false, error: "already_used" };
      }
    }
    throw err;
  }

  return { success: true };
}

export interface SendVerificationResult {
  success: boolean;
  error?: "email_not_configured" | "user_not_found" | "no_email" | "already_verified" | "send_failed";
}

export async function sendEmailVerification(
  userId: string,
  baseUrl: string
): Promise<SendVerificationResult> {
  if (!(await isEmailConfigured())) {
    return { success: false, error: "email_not_configured" };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return { success: false, error: "user_not_found" };
  }

  if (user.emailVerified) {
    return { success: false, error: "already_verified" };
  }

  if (!user.email) {
    return { success: false, error: "no_email" };
  }

  const userEmail = user.email;
  const { token, hash } = generateSecureToken();
  const dbNow = await getDbNowUncached();
  const expiresAt = new Date(dbNow.getTime() + EMAIL_VERIFY_EXPIRY_MS);

  // Atomic delete+insert so an insert failure never leaves the user token-less
  await db.transaction(async (tx) => {
    await tx
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));

    await tx.insert(emailVerificationTokens).values({
      userId,
      email: userEmail,
      tokenHash: hash,
      expiresAt,
    });
  });

  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
  const template = await renderEmailVerificationEmail({
    to: user.email,
    verificationUrl,
    expiresInMinutes: 24 * 60,
  });

  const result = await sendEmail({
    to: user.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  if (!result.success) {
    logger.error({ userId, email: user.email, error: result.error }, "Failed to send verification email");
    return { success: false, error: "send_failed" };
  }

  return { success: true };
}

export interface VerifyEmailResult {
  success: boolean;
  error?: "invalid_token" | "expired";
}

export async function verifyEmail(token: string): Promise<VerifyEmailResult> {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const now = await getDbNowUncached();

  try {
    await db.transaction(async (tx) => {
      // Read token inside transaction to prevent TOCTOU races.
      const row = await tx.query.emailVerificationTokens.findFirst({
        where: and(
          eq(emailVerificationTokens.tokenHash, hash),
          gt(emailVerificationTokens.expiresAt, now),
          isNull(emailVerificationTokens.verifiedAt)
        ),
      });

      if (!row) {
        throw new Error("invalid_token");
      }

      // Update token first with a conditional WHERE that checks verifiedAt IS NULL.
      // Under READ COMMITTED this serializes concurrent verification attempts.
      const tokenUpdate = await tx
        .update(emailVerificationTokens)
        .set({ verifiedAt: now })
        .where(
          and(
            eq(emailVerificationTokens.id, row.id),
            isNull(emailVerificationTokens.verifiedAt)
          )
        );

      if ((tokenUpdate.rowCount ?? 0) === 0) {
        throw new Error("invalid_token");
      }

      await tx
        .update(users)
        .set({ emailVerified: now, updatedAt: now })
        .where(eq(users.id, row.userId));

      logger.info({ userId: row.userId, email: row.email }, "Email verified");
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "invalid_token") {
      return { success: false, error: "invalid_token" };
    }
    throw err;
  }

  return { success: true };
}

export interface NotifySiteEventInput {
  recipients: string[];
  eventType: string;
  title: string;
  details: string;
  severity: "info" | "warning" | "critical";
}

export async function notifySiteEvent(input: NotifySiteEventInput): Promise<void> {
  if (!(await isEmailConfigured())) {
    logger.warn({ eventType: input.eventType, title: input.title }, "Site event notification skipped: SMTP not configured");
    return;
  }

  const template = await renderSiteEventEmail({
    to: input.recipients[0] ?? "",
    eventType: input.eventType,
    title: input.title,
    details: input.details,
    severity: input.severity,
  });

  for (const recipient of input.recipients) {
    const result = await sendEmail({
      to: recipient,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    if (!result.success) {
      logger.error({ recipient, eventType: input.eventType, error: result.error }, "Site event email failed");
    }
  }
}

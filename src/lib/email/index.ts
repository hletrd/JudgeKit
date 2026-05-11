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

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, user.id));

  const { token, hash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hash,
    expiresAt,
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

  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hash),
      gt(passwordResetTokens.expiresAt, new Date()),
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

  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hash),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  });

  if (!row) {
    return { success: false, error: "invalid_token" };
  }

  if (row.usedAt) {
    return { success: false, error: "already_used" };
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, row.userId));

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
  });

  logger.info({ userId: row.userId }, "Password reset completed");
  return { success: true };
}

export interface SendVerificationResult {
  success: boolean;
  error?: "email_not_configured" | "user_not_found" | "already_verified" | "send_failed";
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
    return { success: false, error: "user_not_found" };
  }

  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId));

  const { token, hash } = generateSecureToken();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MS);

  await db.insert(emailVerificationTokens).values({
    userId,
    email: user.email,
    tokenHash: hash,
    expiresAt,
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

  const row = await db.query.emailVerificationTokens.findFirst({
    where: and(
      eq(emailVerificationTokens.tokenHash, hash),
      gt(emailVerificationTokens.expiresAt, new Date()),
      isNull(emailVerificationTokens.verifiedAt)
    ),
  });

  if (!row) {
    return { success: false, error: "invalid_token" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ emailVerified: new Date(), updatedAt: new Date() })
      .where(eq(users.id, row.userId));

    await tx
      .update(emailVerificationTokens)
      .set({ verifiedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id));
  });

  logger.info({ userId: row.userId, email: row.email }, "Email verified");
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

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { users } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { extractClientIp } from "@/lib/security/ip";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { isEmailTaken, isUsernameTaken, validateAndHashPassword } from "@/lib/users/core";
import { getSystemSettings } from "@/lib/system-settings";
import { publicSignupSchema, type PublicSignupInput } from "@/lib/validators/public-signup";
import { isHcaptchaConfigured, verifyHcaptchaToken } from "@/lib/security/hcaptcha";
import { getPublicBaseUrl } from "@/lib/security/env";
import { sendEmailVerification } from "@/lib/email";
import { logger } from "@/lib/logger";
import type { ZodIssue } from "zod";

export type PublicSignupResult = {
  success: boolean;
  error?:
    | "unauthorized"
    | "signupDisabled"
    | "hcaptchaUnavailable"
    | "hcaptchaRequired"
    | "hcaptchaVerificationFailed"
    | "usernameInUse"
    | "emailInUse"
    | "passwordTooShort"
    | "invalidEmail"
    | "nameRequired"
    | "passwordsDoNotMatch"
    | "rateLimited"
    | "createUserFailed"
    | "usernameTooShort"
    | "usernameTooLong"
    | "nameTooLong"
    | "emailTooLong"
    | "passwordTooLong"
    | "passwordContainsUsername"
    | "passwordContainsEmail"
    | "confirmPasswordRequired";
};

/**
 * Map a zod validation issue to a known PublicSignupResult error type.
 * Falls back to "createUserFailed" for unrecognized issues so that
 * schema changes never leak unexpected error strings to the client.
 */
function mapZodIssueToSignupError(issue: ZodIssue): PublicSignupResult["error"] {
  const path = issue.path[0];
  switch (path) {
    case "username":
      if (issue.code === "too_small") return "usernameTooShort";
      if (issue.code === "too_big") return "usernameTooLong";
      return "createUserFailed";
    case "name":
      if (issue.code === "too_small") return "nameRequired";
      if (issue.code === "too_big") return "nameTooLong";
      return "createUserFailed";
    case "email":
      if (issue.code === "invalid_format") return "invalidEmail";
      if (issue.code === "too_big") return "emailTooLong";
      return "createUserFailed";
    case "password":
      if (issue.code === "too_small") return "passwordTooShort";
      if (issue.code === "too_big") return "passwordTooLong";
      return "createUserFailed";
    case "confirmPassword":
      return "confirmPasswordRequired";
    default:
      return "createUserFailed";
  }
}

function getPublicAuthSettings(settings: Awaited<ReturnType<typeof getSystemSettings>>) {
  return {
    publicSignupEnabled: settings?.publicSignupEnabled ?? false,
    signupHcaptchaEnabled: settings?.signupHcaptchaEnabled ?? false,
    defaultLanguage: settings?.defaultLanguage ?? null,
  };
}

export async function registerPublicUser(input: PublicSignupInput): Promise<PublicSignupResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const headerStore = await headers();
  const ipAddress = extractClientIp(headerStore);
  const rateLimit = await checkServerActionRateLimit(`public-signup:${ipAddress ?? "unknown"}`, "registerPublicUser", 10, 60);
  if (rateLimit) {
    return { success: false, error: "rateLimited" };
  }

  const settings = getPublicAuthSettings(await getSystemSettings());
  if (!settings.publicSignupEnabled) {
    return { success: false, error: "signupDisabled" };
  }

  if (settings.signupHcaptchaEnabled && !(await isHcaptchaConfigured())) {
    return { success: false, error: "hcaptchaUnavailable" };
  }

  const parsed = publicSignupSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      error: firstIssue ? mapZodIssueToSignupError(firstIssue) : "createUserFailed",
    };
  }

  const { username, name, email, password, captchaToken } = parsed.data;

  if (settings.signupHcaptchaEnabled) {
    if (!captchaToken) {
      return { success: false, error: "hcaptchaRequired" };
    }

    const captchaResult = await verifyHcaptchaToken(captchaToken, ipAddress);
    if (!captchaResult.success) {
      return { success: false, error: "hcaptchaVerificationFailed" };
    }
  }

  const passwordResult = await validateAndHashPassword(password, { username, email });
  if (passwordResult.error) {
    return { success: false, error: passwordResult.error };
  }

  let createdUserId: string | null = null;
  try {
    await db.transaction(async (tx) => {
      if (await isUsernameTaken(username, undefined, tx)) {
        throw new Error("usernameInUse");
      }

      if (email && await isEmailTaken(email, undefined, tx)) {
        throw new Error("emailInUse");
      }

      const [inserted] = await tx.insert(users).values({
        username,
        name,
        email: email ?? null,
        passwordHash: passwordResult.hash,
        role: "student",
        isActive: true,
        mustChangePassword: false,
        preferredLanguage: settings.defaultLanguage,
      }).returning({ id: users.id });
      createdUserId = inserted?.id ?? null;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "usernameInUse") {
      return { success: false, error: "usernameInUse" };
    }
    if (error instanceof Error && error.message === "emailInUse") {
      return { success: false, error: "emailInUse" };
    }

    const pgError = error as { constraint?: string } | undefined;
    if (pgError?.constraint?.includes("username")) {
      return { success: false, error: "usernameInUse" };
    }
    if (pgError?.constraint?.includes("email")) {
      return { success: false, error: "emailInUse" };
    }

    return { success: false, error: "createUserFailed" };
  }

  const auditContext = await buildServerActionAuditContext("/signup");
  recordAuditEvent({
    actorId: null,
    actorRole: "public",
    action: "public_signup.created",
    resourceType: "user",
    resourceLabel: username,
    summary: `Public sign-up created @${username}`,
    details: {
      username,
      email: email ?? null,
      ipAddress,
    },
    context: auditContext,
  });

  // Auto-send verification email if the user provided an email address.
  // Fire-and-forget: signup succeeds even if the email send fails (the user
  // can resend from the verification prompt). Previously users had to
  // manually trigger "resend verification" — this closes the gap.
  if (email && createdUserId) {
    const h = await headers();
    // Canonical-first origin (see getPublicBaseUrl): do NOT trust the client
    // Host header for the link domain — this server-action path is not behind
    // the trusted-host guard.
    const baseUrl = getPublicBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
    sendEmailVerification(createdUserId, baseUrl).catch((err) => {
      // sendEmailVerification logs its own send failures, but a throw from its
      // DB/token/config steps (e.g. db.transaction or a decrypt failure) would
      // otherwise vanish here. Log it so the operator has a signal; signup still
      // succeeds (the user can resend verification).
      logger.warn(
        { userId: createdUserId, err: err instanceof Error ? err.message : String(err) },
        "verification email dispatch failed"
      );
    });
  }

  revalidatePath("/login");
  revalidatePath("/signup");

  return { success: true };
}

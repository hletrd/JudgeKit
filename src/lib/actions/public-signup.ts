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
    | "confirmPasswordRequired";
};

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
  const rateLimit = await checkServerActionRateLimit(`public-signup:${ipAddress}`, "registerPublicUser", 10, 60);
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
    return {
      success: false,
      error: (parsed.error.issues[0]?.message as PublicSignupResult["error"]) ?? "createUserFailed",
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

  const passwordResult = await validateAndHashPassword(password, { username, email: email ?? null });
  if (passwordResult.error) {
    return { success: false, error: passwordResult.error };
  }

  try {
    await db.transaction(async (tx) => {
      if (await isUsernameTaken(username, undefined, tx)) {
        throw new Error("usernameInUse");
      }

      if (email && await isEmailTaken(email, undefined, tx)) {
        throw new Error("emailInUse");
      }

      await tx.insert(users).values({
        username,
        name,
        email: email ?? null,
        passwordHash: passwordResult.hash,
        role: "student",
        isActive: true,
        mustChangePassword: false,
        preferredLanguage: settings.defaultLanguage,
      });
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

  revalidatePath("/login");
  revalidatePath("/signup");

  return { success: true };
}

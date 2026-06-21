"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { db } from "@/lib/db";
import { systemSettings, smtpSettings, uiContentSettings } from "@/lib/db/schema";
import { DEFAULT_PLATFORM_MODE, GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { invalidateSettingsCache } from "@/lib/system-settings-config";
import { isHcaptchaConfigured } from "@/lib/security/hcaptcha";
import { encrypt } from "@/lib/security/encryption";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { getDbNowUncached } from "@/lib/db-time";
import {
  type SystemSettingsInput,
  systemSettingsSchema,
} from "@/lib/validators/system-settings";

/** Keys for configurable integer settings */
const CONFIG_KEYS = [
  "loginRateLimitMaxAttempts",
  "loginRateLimitWindowMs",
  "loginRateLimitBlockMs",
  "apiRateLimitMax",
  "apiRateLimitWindowMs",
  "submissionRateLimitMaxPerMinute",
  "submissionMaxPending",
  "submissionGlobalQueueLimit",
  "defaultTimeLimitMs",
  "defaultMemoryLimitMb",
  "maxSourceCodeSizeBytes",
  "staleClaimTimeoutMs",
  "sessionMaxAgeSeconds",
  "minPasswordLength",
  "defaultPageSize",
  "maxSseConnectionsPerUser",
  "ssePollIntervalMs",
  "sseTimeoutMs",
  "compilerTimeLimitMs",
  "uploadMaxImageSizeBytes",
  "uploadMaxFileSizeBytes",
  "uploadMaxImageDimension",
  "uploadMaxZipDecompressedSizeBytes",
] as const;

/**
 * Settings columns that hold secrets. Their values are stored encrypted, but
 * must ALSO be redacted before being written into the audit log — otherwise
 * the encrypted ciphertext is persisted into the `auditEvents` table, which is
 * a secret-handling inconsistency (the encrypted value should never be
 * duplicated into general-purpose logs). Keep this in sync with every `encrypt`
 * call in the write logic below so adding a secret column is a single,
 * deliberate change rather than a silently-missed redaction.
 */
const SECRET_SETTING_KEYS = new Set<string>(["hcaptchaSecret", "smtpPass"]);

type UpdateSystemSettingsResult = {
  success: boolean;
  error?: string;
};

export async function updateSystemSettings(
  input: SystemSettingsInput
): Promise<UpdateSystemSettingsResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "unauthorized" };
  }

  const caps = await resolveCapabilities(session.user.role);
  if (!caps.has("system.settings")) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "updateSystemSettings", 20, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const parsedInput = systemSettingsSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      success: false,
      error: parsedInput.error.issues[0]?.message ?? "updateError",
    };
  }

  const {
    siteTitle,
    siteDescription,
    siteIconUrl,
    timeZone,
    platformMode,
    aiAssistantEnabled,
    allowAiAssistantInRestrictedModes,
    allowStandaloneCompilerInRestrictedModes,
    publicSignupEnabled,
    emailVerificationRequired,
    communityUpvoteEnabled,
    communityDownvoteEnabled,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    smtpFrom,
    signupHcaptchaEnabled,
    hcaptchaSiteKey,
    hcaptchaSecret,
    defaultLanguage,
    allowedHosts,
    homePageContent,
    footerContent,
    defaultLocale,
  } = parsedInput.data;

  // hCaptcha is considered configured if new keys are provided in this request OR already stored in DB / env
  const hasNewKeys = (hcaptchaSiteKey && hcaptchaSiteKey.length > 0) || (hcaptchaSecret && hcaptchaSecret.length > 0);
  if (signupHcaptchaEnabled && !hasNewKeys && !(await isHcaptchaConfigured())) {
    return { success: false, error: "signupHcaptchaUnavailable" };
  }

  const hasOwnInput = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  // Build config fields — undefined means "not provided", null means "clear to default"
  const configValues: Record<string, number | null> = {};
  for (const key of CONFIG_KEYS) {
    const val = parsedInput.data[key];
    // val is number | null | undefined; undefined = not in payload, skip
    if (val !== undefined) {
      configValues[key] = val;
    }
  }

  const baseValues: Record<string, unknown> = {
    ...configValues,
    updatedAt: await getDbNowUncached(),
  };

  if (hasOwnInput("siteTitle")) {
    baseValues.siteTitle = siteTitle ?? null;
  }
  if (hasOwnInput("siteDescription")) {
    baseValues.siteDescription = siteDescription ?? null;
  }
  if (hasOwnInput("siteIconUrl")) {
    baseValues.siteIconUrl = siteIconUrl ?? null;
  }
  if (hasOwnInput("timeZone")) {
    baseValues.timeZone = timeZone ?? null;
  }
  if (hasOwnInput("platformMode")) {
    baseValues.platformMode = platformMode ?? DEFAULT_PLATFORM_MODE;
  }
  if (hasOwnInput("aiAssistantEnabled")) {
    baseValues.aiAssistantEnabled = aiAssistantEnabled ?? true;
  }
  if (hasOwnInput("allowAiAssistantInRestrictedModes")) {
    baseValues.allowAiAssistantInRestrictedModes = allowAiAssistantInRestrictedModes ?? false;
  }
  if (hasOwnInput("allowStandaloneCompilerInRestrictedModes")) {
    baseValues.allowStandaloneCompilerInRestrictedModes = allowStandaloneCompilerInRestrictedModes ?? false;
  }
  if (hasOwnInput("publicSignupEnabled")) {
    baseValues.publicSignupEnabled = publicSignupEnabled ?? false;
  }
  if (hasOwnInput("emailVerificationRequired")) {
    baseValues.emailVerificationRequired = emailVerificationRequired ?? true;
  }
  if (hasOwnInput("communityUpvoteEnabled")) {
    baseValues.communityUpvoteEnabled = communityUpvoteEnabled ?? true;
  }
  if (hasOwnInput("communityDownvoteEnabled")) {
    baseValues.communityDownvoteEnabled = communityDownvoteEnabled ?? true;
  }
  if (hasOwnInput("smtpHost")) {
    baseValues.smtpHost = smtpHost ?? null;
  }
  if (hasOwnInput("smtpPort")) {
    baseValues.smtpPort = smtpPort ?? null;
  }
  if (hasOwnInput("smtpSecure")) {
    baseValues.smtpSecure = smtpSecure ?? false;
  }
  if (hasOwnInput("smtpUser")) {
    baseValues.smtpUser = smtpUser ?? null;
  }
  if (hasOwnInput("smtpPass")) {
    baseValues.smtpPass = smtpPass ? encrypt(smtpPass) : null;
  }
  if (hasOwnInput("smtpFrom")) {
    baseValues.smtpFrom = smtpFrom ?? null;
  }
  if (hasOwnInput("signupHcaptchaEnabled")) {
    baseValues.signupHcaptchaEnabled = signupHcaptchaEnabled ?? false;
  }
  if (hasOwnInput("hcaptchaSiteKey")) {
    baseValues.hcaptchaSiteKey = hcaptchaSiteKey ?? null;
  }
  if (hasOwnInput("hcaptchaSecret")) {
    baseValues.hcaptchaSecret = hcaptchaSecret ? encrypt(hcaptchaSecret) : null;
  }
  if (hasOwnInput("defaultLanguage")) {
    baseValues.defaultLanguage = defaultLanguage ?? null;
  }
  if (hasOwnInput("homePageContent")) {
    baseValues.homePageContent = homePageContent ?? null;
  }
  if (hasOwnInput("footerContent")) {
    baseValues.footerContent = footerContent ?? null;
  }
  if (hasOwnInput("defaultLocale")) {
    baseValues.defaultLocale = defaultLocale ?? null;
  }

  if (allowedHosts !== undefined) {
    baseValues.allowedHosts = allowedHosts.length > 0 ? JSON.stringify(allowedHosts) : null;
  }

  // SMTP config and UI content live in their own domain tables (split out of
  // the system_settings god-table). Partition the change set by destination
  // table, then upsert each in a single transaction so a partial write can't
  // leave the three rows inconsistent.
  const SMTP_KEYS = new Set([
    "smtpHost",
    "smtpPort",
    "smtpSecure",
    "smtpUser",
    "smtpPass",
    "smtpFrom",
    "emailVerificationRequired",
  ]);
  const UI_CONTENT_KEYS = new Set(["homePageContent", "footerContent"]);

  const updatedAt = baseValues.updatedAt as Date;
  const systemValues: Record<string, unknown> = {};
  const smtpValues: Record<string, unknown> = {};
  const uiValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(baseValues)) {
    if (key === "updatedAt") continue;
    if (SMTP_KEYS.has(key)) smtpValues[key] = value;
    else if (UI_CONTENT_KEYS.has(key)) uiValues[key] = value;
    else systemValues[key] = value;
  }

  await db.transaction(async (tx) => {
    // Always upsert system_settings so the global anchor row exists and its
    // updatedAt is bumped, matching the pre-split behavior.
    await tx
      .insert(systemSettings)
      .values({ id: GLOBAL_SETTINGS_ID, ...systemValues, updatedAt })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: { ...systemValues, updatedAt },
      });

    if (Object.keys(smtpValues).length > 0) {
      await tx
        .insert(smtpSettings)
        .values({ id: GLOBAL_SETTINGS_ID, ...smtpValues, updatedAt })
        .onConflictDoUpdate({
          target: smtpSettings.id,
          set: { ...smtpValues, updatedAt },
        });
    }

    if (Object.keys(uiValues).length > 0) {
      await tx
        .insert(uiContentSettings)
        .values({ id: GLOBAL_SETTINGS_ID, ...uiValues, updatedAt })
        .onConflictDoUpdate({
          target: uiContentSettings.id,
          set: { ...uiValues, updatedAt },
        });
    }
  });

  invalidateSettingsCache();

  const auditDetails = JSON.parse(JSON.stringify(
    Object.fromEntries(
      Object.entries(baseValues)
        .filter(([key]) => key !== "updatedAt")
        .map(([key, val]) => [key, SECRET_SETTING_KEYS.has(key) && typeof val === "string" && val.length > 0 ? "••••••••" : val])
    )
  ));

  const auditContext = await buildServerActionAuditContext("/dashboard/admin/settings");
  recordAuditEvent({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "system_settings.updated",
    resourceType: "system_settings",
    resourceId: GLOBAL_SETTINGS_ID,
    resourceLabel: "Global settings",
    summary: "Updated global system settings",
    details: auditDetails,
    context: auditContext,
  });

  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/signup");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/admin/settings");

  return { success: true };
}

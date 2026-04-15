"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { DEFAULT_PLATFORM_MODE, GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { invalidateSettingsCache } from "@/lib/system-settings-config";
import { isHcaptchaConfigured } from "@/lib/security/hcaptcha";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
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
] as const;

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
    timeZone,
    platformMode,
    aiAssistantEnabled,
    publicSignupEnabled,
    signupHcaptchaEnabled,
    defaultLanguage,
    allowedHosts,
    homePageContent,
    footerContent,
    defaultLocale,
  } = parsedInput.data;

  if (signupHcaptchaEnabled && !isHcaptchaConfigured()) {
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
    updatedAt: new Date(),
  };

  if (hasOwnInput("siteTitle")) {
    baseValues.siteTitle = siteTitle ?? null;
  }
  if (hasOwnInput("siteDescription")) {
    baseValues.siteDescription = siteDescription ?? null;
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
  if (hasOwnInput("publicSignupEnabled")) {
    baseValues.publicSignupEnabled = publicSignupEnabled ?? false;
  }
  if (hasOwnInput("signupHcaptchaEnabled")) {
    baseValues.signupHcaptchaEnabled = signupHcaptchaEnabled ?? false;
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

  await db
    .insert(systemSettings)
    .values({
      id: GLOBAL_SETTINGS_ID,
      ...baseValues,
    })
    .onConflictDoUpdate({
      target: systemSettings.id,
      set: baseValues,
    });

  invalidateSettingsCache();

  const auditDetails = JSON.parse(JSON.stringify(
    Object.fromEntries(
      Object.entries(baseValues).filter(([key]) => key !== "updatedAt")
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

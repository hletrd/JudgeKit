"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { DEFAULT_PLATFORM_MODE, GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { invalidateSettingsCache } from "@/lib/system-settings-config";
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

  const { siteTitle, siteDescription, timeZone, platformMode, aiAssistantEnabled, defaultLanguage, allowedHosts } = parsedInput.data;

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
    siteTitle: siteTitle ?? null,
    siteDescription: siteDescription ?? null,
    timeZone: timeZone ?? null,
    platformMode: platformMode ?? DEFAULT_PLATFORM_MODE,
    aiAssistantEnabled: aiAssistantEnabled ?? true,
    defaultLanguage: defaultLanguage ?? null,
    ...configValues,
    updatedAt: new Date(),
  };

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

  const auditContext = await buildServerActionAuditContext("/dashboard/admin/settings");
  recordAuditEvent({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "system_settings.updated",
    resourceType: "system_settings",
    resourceId: GLOBAL_SETTINGS_ID,
    resourceLabel: "Global settings",
    summary: "Updated global system settings",
    details: {
      siteTitle: siteTitle ?? null,
      siteDescription: siteDescription ?? null,
      timeZone: timeZone ?? null,
      platformMode: platformMode ?? DEFAULT_PLATFORM_MODE,
      aiAssistantEnabled: aiAssistantEnabled ?? true,
      defaultLanguage: defaultLanguage ?? null,
      ...configValues,
    },
    context: auditContext,
  });

  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/admin/settings");

  return { success: true };
}

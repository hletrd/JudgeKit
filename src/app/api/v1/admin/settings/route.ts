import { NextRequest } from "next/server";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { DEFAULT_PLATFORM_MODE, getSystemSettings, GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { invalidateSettingsCache } from "@/lib/system-settings-config";
import { systemSettingsSchema } from "@/lib/validators/system-settings";
import { recordAuditEvent } from "@/lib/audit/events";

export const GET = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  handler: async (req: NextRequest, { user }) => {
    void req;
    void user;
    const settings = await getSystemSettings();
    return apiSuccess(settings ?? {});
  },
});

export const PUT = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  schema: systemSettingsSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const { siteTitle, siteDescription, timeZone, platformMode, aiAssistantEnabled, allowedHosts, ...restConfig } = body;

    // Explicitly enumerate allowed numeric config keys to prevent arbitrary field injection
    const allowedConfigKeys = [
      "defaultLanguage",
      "loginRateLimitMaxAttempts", "loginRateLimitWindowMs", "loginRateLimitBlockMs",
      "apiRateLimitMax", "apiRateLimitWindowMs",
      "submissionRateLimitMaxPerMinute", "submissionMaxPending", "submissionGlobalQueueLimit",
      "defaultTimeLimitMs", "defaultMemoryLimitMb", "maxSourceCodeSizeBytes", "staleClaimTimeoutMs",
      "sessionMaxAgeSeconds", "minPasswordLength",
      "defaultPageSize",
      "maxSseConnectionsPerUser", "ssePollIntervalMs", "sseTimeoutMs",
      "compilerTimeLimitMs",
      "uploadMaxImageSizeBytes", "uploadMaxFileSizeBytes", "uploadMaxImageDimension",
    ] as const;

    const filteredConfig = Object.fromEntries(
      Object.entries(restConfig).filter(([k]) => (allowedConfigKeys as readonly string[]).includes(k))
    );

    const baseValues: Record<string, unknown> = {
      siteTitle: siteTitle ?? null,
      siteDescription: siteDescription ?? null,
      timeZone: timeZone ?? null,
      platformMode: platformMode ?? DEFAULT_PLATFORM_MODE,
      aiAssistantEnabled: aiAssistantEnabled ?? true,
      updatedAt: new Date(),
    };

    // Add numeric config values (undefined = not in payload, null = clear to default)
    for (const [key, val] of Object.entries(filteredConfig)) {
      if (val !== undefined) {
        baseValues[key] = val;
      }
    }

    if (allowedHosts !== undefined) {
      baseValues.allowedHosts = allowedHosts.length > 0 ? JSON.stringify(allowedHosts) : null;
    }

    await db
      .insert(systemSettings)
      .values({ id: GLOBAL_SETTINGS_ID, ...baseValues })
      .onConflictDoUpdate({
        target: systemSettings.id,
        set: baseValues,
      });

    invalidateSettingsCache();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "system_settings.updated",
      resourceType: "system_settings",
      resourceId: GLOBAL_SETTINGS_ID,
      resourceLabel: "Global settings",
      summary: "Updated global system settings via API",
      details: {
        siteTitle: siteTitle ?? null,
        siteDescription: siteDescription ?? null,
        timeZone: timeZone ?? null,
        platformMode: platformMode ?? DEFAULT_PLATFORM_MODE,
        aiAssistantEnabled: aiAssistantEnabled ?? true,
      },
      request: req,
    });

    const updated = await getSystemSettings();
    return apiSuccess(updated ?? {});
  },
});

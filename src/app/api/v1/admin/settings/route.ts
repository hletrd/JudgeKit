import { NextRequest } from "next/server";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSystemSettings, GLOBAL_SETTINGS_ID } from "@/lib/system-settings";
import { invalidateSettingsCache } from "@/lib/system-settings-config";
import { systemSettingsSchema } from "@/lib/validators/system-settings";
import { recordAuditEvent } from "@/lib/audit/events";

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const settings = await getSystemSettings();
    return apiSuccess(settings ?? {});
  },
});

export const PUT = createApiHandler({
  schema: systemSettingsSchema,
  handler: async (req: NextRequest, { user, body }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const { siteTitle, siteDescription, timeZone, aiAssistantEnabled, allowedHosts, ...configValues } = body;

    const baseValues: Record<string, unknown> = {
      siteTitle: siteTitle ?? null,
      siteDescription: siteDescription ?? null,
      timeZone: timeZone ?? null,
      aiAssistantEnabled: aiAssistantEnabled ?? true,
      updatedAt: new Date(),
    };

    // Add numeric config values (undefined = not in payload, null = clear to default)
    for (const [key, val] of Object.entries(configValues)) {
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
        aiAssistantEnabled: aiAssistantEnabled ?? true,
      },
      request: req,
    });

    const updated = await getSystemSettings();
    return apiSuccess(updated ?? {});
  },
});

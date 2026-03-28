import { cache } from "react";
import { eq } from "drizzle-orm";
import { DEFAULT_TIME_ZONE } from "@/lib/datetime";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";

const GLOBAL_SETTINGS_ID = "global";
export const DEFAULT_SYSTEM_TIME_ZONE = DEFAULT_TIME_ZONE;

export async function getSystemSettings() {
  try {
    return await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, GLOBAL_SETTINGS_ID),
    });
  } catch {
    // Fallback: query without new columns (migration may not have run yet)
    const rows = await db
      .select({
        id: systemSettings.id,
        siteTitle: systemSettings.siteTitle,
        siteDescription: systemSettings.siteDescription,
        timeZone: systemSettings.timeZone,
        updatedAt: systemSettings.updatedAt,
        aiAssistantEnabled: systemSettings.aiAssistantEnabled,
      })
      .from(systemSettings)
      .where(eq(systemSettings.id, GLOBAL_SETTINGS_ID))
      .limit(1);
    return rows[0] ?? undefined;
  }
}

export const getResolvedSystemSettings = cache(async (defaults: {
  siteTitle: string;
  siteDescription: string;
  timeZone?: string;
}) => {
  const settings = await getSystemSettings();

  return {
    siteTitle: settings?.siteTitle ?? defaults.siteTitle,
    siteDescription: settings?.siteDescription ?? defaults.siteDescription,
    timeZone: settings?.timeZone ?? defaults.timeZone ?? DEFAULT_SYSTEM_TIME_ZONE,
    aiAssistantEnabled: settings?.aiAssistantEnabled ?? true,
  };
});

export async function isAiAssistantEnabled(): Promise<boolean> {
  try {
    const settings = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.id, GLOBAL_SETTINGS_ID),
      columns: { aiAssistantEnabled: true },
    });
    return settings?.aiAssistantEnabled ?? true;
  } catch {
    return true; // Default to enabled if column doesn't exist yet
  }
}

export async function getResolvedSystemTimeZone() {
  const settings = await getSystemSettings();

  return settings?.timeZone ?? DEFAULT_SYSTEM_TIME_ZONE;
}

export { GLOBAL_SETTINGS_ID };

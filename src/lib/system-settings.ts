import { eq } from "drizzle-orm";
import { DEFAULT_TIME_ZONE } from "@/lib/datetime";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";

const GLOBAL_SETTINGS_ID = "global";
export const DEFAULT_SYSTEM_TIME_ZONE = DEFAULT_TIME_ZONE;

export async function getSystemSettings() {
  return db.query.systemSettings.findFirst({
    where: eq(systemSettings.id, GLOBAL_SETTINGS_ID),
  });
}

export async function getResolvedSystemSettings(defaults: {
  siteTitle: string;
  siteDescription: string;
  timeZone?: string;
}) {
  const settings = await getSystemSettings();

  return {
    siteTitle: settings?.siteTitle ?? defaults.siteTitle,
    siteDescription: settings?.siteDescription ?? defaults.siteDescription,
    timeZone: settings?.timeZone ?? defaults.timeZone ?? DEFAULT_SYSTEM_TIME_ZONE,
  };
}

export async function getResolvedSystemTimeZone() {
  const settings = await getSystemSettings();

  return settings?.timeZone ?? DEFAULT_SYSTEM_TIME_ZONE;
}

export { GLOBAL_SETTINGS_ID };

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";

const GLOBAL_SETTINGS_ID = "global";

export async function getSystemSettings() {
  return db.query.systemSettings.findFirst({
    where: eq(systemSettings.id, GLOBAL_SETTINGS_ID),
  });
}

export async function getResolvedSystemSettings(defaults: {
  siteTitle: string;
  siteDescription: string;
}) {
  const settings = await getSystemSettings();

  return {
    siteTitle: settings?.siteTitle ?? defaults.siteTitle,
    siteDescription: settings?.siteDescription ?? defaults.siteDescription,
  };
}

export { GLOBAL_SETTINGS_ID };

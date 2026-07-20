import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { getSystemSettings } from "@/lib/system-settings";
import {
  defaultWarmPoolConfig,
  resolveWarmPoolTargets,
  type WarmPoolConfig,
  type WarmPoolTargets,
} from "@/lib/judge/warm-pool";

const DISABLED: WarmPoolTargets = { enabled: false, images: {} };

/**
 * Resolve the warm-pool targets a worker should reconcile against. Shipped in
 * the register and heartbeat responses so an admin toggle reaches the fleet
 * within one heartbeat without a redeploy.
 *
 * Fails closed: any lookup error yields disabled targets, which degrades the
 * worker to today's cold-start behaviour rather than breaking heartbeats.
 */
export async function getWarmPoolTargets(): Promise<WarmPoolTargets> {
  try {
    const settings = await getSystemSettings();
    const stored = settings?.warmPool as WarmPoolConfig | null | undefined;
    const config = stored ?? defaultWarmPoolConfig();

    const rows = await db
      .select({
        language: languageConfigs.language,
        isEnabled: languageConfigs.isEnabled,
      })
      .from(languageConfigs);

    const enabled = new Set(
      rows.filter((row) => row.isEnabled !== false).map((row) => row.language),
    );

    return resolveWarmPoolTargets(config, enabled);
  } catch {
    return DISABLED;
  }
}

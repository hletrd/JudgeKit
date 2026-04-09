"use server";

import { db } from "@/lib/db";
import { plugins } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { auth } from "@/lib/auth";
import { buildServerActionAuditContext, recordAuditEvent } from "@/lib/audit/events";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { isTrustedServerActionOrigin } from "@/lib/security/server-actions";
import { checkServerActionRateLimit } from "@/lib/security/api-rate-limit";
import { logger } from "@/lib/logger";
import { preparePluginConfigForStorage, redactPluginConfigForAudit } from "@/lib/plugins/secrets";
import { eq } from "drizzle-orm";

type PluginActionResult =
  | { success: true }
  | { success: false; error: string };

async function canManagePlugins(role: string) {
  const caps = await resolveCapabilities(role);
  return caps.has("system.plugins");
}

export async function togglePlugin(pluginId: string, enabled: boolean): Promise<PluginActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || !(await canManagePlugins(session.user.role))) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "togglePlugin", 20, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const definition = getPluginDefinition(pluginId);
  if (!definition) {
    return { success: false, error: "pluginNotFound" };
  }

  try {
    await db.insert(plugins).values({
      id: pluginId,
      enabled,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: plugins.id,
      set: withUpdatedAt({ enabled }),
    });

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/plugins");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "plugin.toggled",
      resourceType: "plugin",
      resourceId: pluginId,
      resourceLabel: pluginId,
      summary: `${enabled ? "Enabled" : "Disabled"} plugin ${pluginId}`,
      details: {
        pluginId,
        enabled,
      },
      context: auditContext,
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to toggle plugin");
    return { success: false, error: "toggleFailed" };
  }
}

export async function updatePluginConfig(pluginId: string, rawConfig: unknown): Promise<PluginActionResult> {
  if (!(await isTrustedServerActionOrigin())) {
    return { success: false, error: "unauthorized" };
  }

  const session = await auth();
  if (!session?.user || !(await canManagePlugins(session.user.role))) {
    return { success: false, error: "unauthorized" };
  }

  const rateLimit = await checkServerActionRateLimit(session.user.id, "updatePluginConfig", 20, 60);
  if (rateLimit) return { success: false, error: "rateLimited" };

  const definition = getPluginDefinition(pluginId);
  if (!definition) {
    return { success: false, error: "pluginNotFound" };
  }

  const parsed = definition.configSchema.safeParse(rawConfig);
  if (!parsed.success) {
    return { success: false, error: "invalidConfig" };
  }

    const validatedConfig = parsed.data as Record<string, unknown>;

  try {
    const [existingRow] = await db
      .select({ config: plugins.config, enabled: plugins.enabled })
      .from(plugins)
      .where(eq(plugins.id, pluginId))
      .limit(1);
    const storedConfig = preparePluginConfigForStorage(
      pluginId,
      validatedConfig,
      (existingRow?.config as Record<string, unknown>) ?? null
    );

    await db.insert(plugins).values({
      id: pluginId,
      enabled: existingRow?.enabled ?? false,
      config: storedConfig,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: plugins.id,
      set: withUpdatedAt({
        config: storedConfig,
        ...(existingRow?.enabled !== undefined ? { enabled: existingRow.enabled } : {}),
      }),
    });

    const auditContext = await buildServerActionAuditContext("/dashboard/admin/plugins");
    recordAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "plugin.config_updated",
      resourceType: "plugin",
      resourceId: pluginId,
      resourceLabel: pluginId,
      summary: `Updated config for plugin ${pluginId}`,
      details: {
        pluginId,
        config: redactPluginConfigForAudit(pluginId, validatedConfig) as Record<string, string>,
      },
      context: auditContext,
    });

    return { success: true };
  } catch (error) {
    logger.error({ err: error }, "Failed to update plugin config");
    return { success: false, error: "configUpdateFailed" };
  }
}

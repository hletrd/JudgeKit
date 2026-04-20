import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler, notFound } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { plugins } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { getPluginState } from "@/lib/plugins/data";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";
import { preparePluginConfigForStorage, redactPluginConfigForAudit } from "@/lib/plugins/secrets";
import { eq } from "drizzle-orm";

const updatePluginSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const GET = createApiHandler({
  auth: { capabilities: ["system.plugins"] },
  handler: async (_req: NextRequest, { params }) => {
    const state = await getPluginState(params.id);
    if (!state) return notFound("plugin");

    return apiSuccess({
      id: state.id,
      enabled: state.enabled,
      config: state.config,
      nameKey: state.definition.nameKey,
      descriptionKey: state.definition.descriptionKey,
      defaultConfig: state.definition.defaultConfig,
      updatedAt: state.updatedAt,
    });
  },
});

export const PATCH = createApiHandler({
  auth: { capabilities: ["system.plugins"] },
  schema: updatePluginSchema,
  handler: async (req: NextRequest, { user, body, params }) => {

    const definition = getPluginDefinition(params.id);
    if (!definition) return notFound("plugin");

    // Handle config update with validation
    if (body.config !== undefined) {
      const parsed = definition.configSchema.safeParse(body.config);
      if (!parsed.success) {
        return apiError("invalidConfig", 400);
      }

      const validatedConfig = parsed.data as Record<string, unknown>;
      const [existingRow] = await db
        .select({ config: plugins.config, enabled: plugins.enabled })
        .from(plugins)
        .where(eq(plugins.id, params.id))
        .limit(1);
      const storedConfig = preparePluginConfigForStorage(
        params.id,
        validatedConfig,
        (existingRow?.config as Record<string, unknown>) ?? null
      );

      await db
        .insert(plugins)
        .values({
          id: params.id,
          enabled: body.enabled ?? existingRow?.enabled ?? false,
          config: storedConfig,
          updatedAt: await getDbNowUncached(),
        })
        .onConflictDoUpdate({
          target: plugins.id,
          set: withUpdatedAt({
            config: storedConfig,
            ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          }),
        });

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "plugin.config_updated",
        resourceType: "plugin",
        resourceId: params.id,
        resourceLabel: params.id,
        summary: `Updated config for plugin ${params.id}`,
        details: {
          pluginId: params.id,
          config: redactPluginConfigForAudit(params.id, validatedConfig) as Record<string, string>,
        },
        request: req,
      });
    } else if (body.enabled !== undefined) {
      // Toggle only
      await db
        .insert(plugins)
        .values({
          id: params.id,
          enabled: body.enabled,
          updatedAt: await getDbNowUncached(),
        })
        .onConflictDoUpdate({
          target: plugins.id,
          set: withUpdatedAt({ enabled: body.enabled }),
        });

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "plugin.toggled",
        resourceType: "plugin",
        resourceId: params.id,
        resourceLabel: params.id,
        summary: `${body.enabled ? "Enabled" : "Disabled"} plugin ${params.id}`,
        details: { pluginId: params.id, enabled: body.enabled },
        request: req,
      });
    }

    const state = await getPluginState(params.id);
    if (!state) return apiError("pluginStateLoadFailed", 500);
    return apiSuccess({
      id: state.id,
      enabled: state.enabled,
      config: state.config,
      nameKey: state.definition.nameKey,
      descriptionKey: state.definition.descriptionKey,
      updatedAt: state.updatedAt,
    });
  },
});

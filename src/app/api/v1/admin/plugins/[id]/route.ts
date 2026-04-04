import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler, isAdmin, notFound } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { plugins } from "@/lib/db/schema";
import { withUpdatedAt } from "@/lib/db/helpers";
import { getPluginDefinition } from "@/lib/plugins/registry";
import { getPluginState } from "@/lib/plugins/data";
import { recordAuditEvent } from "@/lib/audit/events";

const updatePluginSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

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
  schema: updatePluginSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const definition = getPluginDefinition(params.id);
    if (!definition) return notFound("plugin");

    // Handle config update with validation
    if (body.config !== undefined) {
      const parsed = definition.configSchema.safeParse(body.config);
      if (!parsed.success) {
        return apiError("invalidConfig", 400);
      }

      const validatedConfig = parsed.data as Record<string, unknown>;

      await db
        .insert(plugins)
        .values({
          id: params.id,
          enabled: body.enabled ?? false,
          config: validatedConfig,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: plugins.id,
          set: withUpdatedAt({
            config: validatedConfig,
            ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          }),
        });

      // Redact sensitive keys for audit
      const SENSITIVE_KEY_PATTERN = /key|secret|token|password|credential/i;
      const redactedConfig: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(validatedConfig)) {
        redactedConfig[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : value;
      }

      recordAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "plugin.config_updated",
        resourceType: "plugin",
        resourceId: params.id,
        resourceLabel: params.id,
        summary: `Updated config for plugin ${params.id}`,
        details: { pluginId: params.id, config: redactedConfig as Record<string, string> },
        request: req,
      });
    } else if (body.enabled !== undefined) {
      // Toggle only
      await db
        .insert(plugins)
        .values({
          id: params.id,
          enabled: body.enabled,
          updatedAt: new Date(),
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
    return apiSuccess({
      id: state!.id,
      enabled: state!.enabled,
      config: state!.config,
      nameKey: state!.definition.nameKey,
      descriptionKey: state!.definition.descriptionKey,
      updatedAt: state!.updatedAt,
    });
  },
});

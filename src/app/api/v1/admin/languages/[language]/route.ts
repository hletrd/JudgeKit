import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler, isAdmin, notFound } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";

const updateLanguageSchema = z.object({
  dockerImage: z.string().min(1).max(200).optional(),
  compileCommand: z.string().max(500).nullable().optional(),
  runCommand: z.string().min(1).max(500).optional(),
  dockerfile: z.string().max(10000).nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const [lang] = await db
      .select()
      .from(languageConfigs)
      .where(eq(languageConfigs.language, params.language))
      .limit(1);

    if (!lang) return notFound("language");
    return apiSuccess(lang);
  },
});

export const PATCH = createApiHandler({
  schema: updateLanguageSchema,
  handler: async (req: NextRequest, { user, body, params }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const existing = await db
      .select({ id: languageConfigs.id })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, params.language))
      .limit(1);

    if (existing.length === 0) return notFound("language");

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.dockerImage !== undefined) updateValues.dockerImage = body.dockerImage;
    if (body.compileCommand !== undefined) updateValues.compileCommand = body.compileCommand;
    if (body.runCommand !== undefined) updateValues.runCommand = body.runCommand;
    if (body.dockerfile !== undefined) updateValues.dockerfile = body.dockerfile;
    if (body.isEnabled !== undefined) updateValues.isEnabled = body.isEnabled;

    await db
      .update(languageConfigs)
      .set(updateValues)
      .where(eq(languageConfigs.language, params.language));

    const action = body.isEnabled !== undefined
      ? `${body.isEnabled ? "Enabled" : "Disabled"} language ${params.language}`
      : `Updated config for language ${params.language}`;

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: body.isEnabled !== undefined ? "language_config.toggled" : "language_config.updated",
      resourceType: "language_config",
      resourceId: params.language,
      resourceLabel: params.language,
      summary: action,
      details: { language: params.language, ...body },
      request: req,
    });

    const [updated] = await db
      .select()
      .from(languageConfigs)
      .where(eq(languageConfigs.language, params.language))
      .limit(1);

    return apiSuccess(updated);
  },
});

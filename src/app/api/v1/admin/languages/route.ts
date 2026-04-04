import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler, isAdmin } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";

const addLanguageSchema = z.object({
  language: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "invalidLanguageKey"),
  displayName: z.string().min(1).max(100),
  standard: z.string().max(50).nullable().optional(),
  extension: z.string().min(1).max(20),
  dockerImage: z.string().min(1).max(200),
  compiler: z.string().max(100).nullable().optional(),
  compileCommand: z.string().max(500).nullable().optional(),
  runCommand: z.string().min(1).max(500),
  dockerfile: z.string().max(10000).nullable().optional(),
});

export const GET = createApiHandler({
  handler: async (req: NextRequest, { user }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const languages = await db
      .select()
      .from(languageConfigs)
      .orderBy(asc(languageConfigs.displayName), asc(languageConfigs.standard));

    return apiSuccess(languages);
  },
});

export const POST = createApiHandler({
  rateLimit: "languages:create",
  schema: addLanguageSchema,
  handler: async (req: NextRequest, { user, body }) => {
    if (!isAdmin(user.role)) return apiError("forbidden", 403);

    const existing = await db
      .select({ id: languageConfigs.id })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, body.language))
      .limit(1);

    if (existing.length > 0) {
      return apiError("languageAlreadyExists", 409);
    }

    const [created] = await db
      .insert(languageConfigs)
      .values({
        language: body.language,
        displayName: body.displayName.trim(),
        standard: body.standard?.trim() || null,
        extension: body.extension.trim(),
        dockerImage: body.dockerImage.trim(),
        compiler: body.compiler?.trim() || null,
        compileCommand: body.compileCommand?.trim() || null,
        runCommand: body.runCommand.trim(),
        dockerfile: body.dockerfile?.trim() || null,
        isEnabled: true,
        updatedAt: new Date(),
      })
      .returning();

    recordAuditEvent({
      actorId: user.id,
      actorRole: user.role,
      action: "language_config.created",
      resourceType: "language_config",
      resourceId: body.language,
      resourceLabel: body.displayName,
      summary: `Created new language ${body.language} (${body.displayName})`,
      details: {
        language: body.language,
        displayName: body.displayName,
        dockerImage: body.dockerImage,
        extension: body.extension,
      },
      request: req,
    });

    return apiSuccess(created, { status: 201 });
  },
});

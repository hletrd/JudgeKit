import { NextRequest } from "next/server";
import { z } from "zod";
import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit/events";
import { getDbNowUncached } from "@/lib/db-time";
import { isAllowedJudgeDockerImage } from "@/lib/judge/docker-image-validation";

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
  starterCode: z.string().max(20000).nullable().optional(),
});

export const GET = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  handler: async () => {
    // Omit dockerfile from the list endpoint — it can be up to 10,000 chars
    // and is available via the individual language GET route when needed.
    const languages = await db
      .select({
        id: languageConfigs.id,
        language: languageConfigs.language,
        displayName: languageConfigs.displayName,
        standard: languageConfigs.standard,
        extension: languageConfigs.extension,
        dockerImage: languageConfigs.dockerImage,
        compiler: languageConfigs.compiler,
        compileCommand: languageConfigs.compileCommand,
        runCommand: languageConfigs.runCommand,
        isEnabled: languageConfigs.isEnabled,
        updatedAt: languageConfigs.updatedAt,
      })
      .from(languageConfigs)
      .orderBy(asc(languageConfigs.displayName), asc(languageConfigs.standard));

    return apiSuccess(languages);
  },
});

export const POST = createApiHandler({
  auth: { capabilities: ["system.settings"] },
  rateLimit: "languages:create",
  schema: addLanguageSchema,
  handler: async (req: NextRequest, { user, body }) => {
    const existing = await db
      .select({ id: languageConfigs.id })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, body.language))
      .limit(1);

    if (existing.length > 0) {
      return apiError("languageAlreadyExists", 409);
    }

    // Only allow local `judge-*` tags or trusted-registry `judge-*` images.
    // The stored value is what the Rust worker pulls and runs student code
    // inside, so an arbitrary registry image is an RCE surface. The same
    // validator is enforced on the image-build path
    // (admin/docker/images/build/route.ts).
    if (!isAllowedJudgeDockerImage(body.dockerImage.trim())) {
      return apiError("invalidDockerImage", 422);
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
        // Preserve starter code verbatim (leading whitespace/indentation is
        // significant); only an all-whitespace value collapses to null/blank.
        starterCode: body.starterCode && body.starterCode.trim() ? body.starterCode : null,
        isEnabled: true,
        updatedAt: await getDbNowUncached(),
      })
      // The SELECT pre-check above races with a concurrent create of the same
      // language key: both pass, and the loser previously died on the unique
      // constraint as a generic 500. Resolve the race at the constraint and
      // translate it into the same 409 the pre-check returns.
      .onConflictDoNothing({ target: languageConfigs.language })
      .returning();

    if (!created) {
      return apiError("languageAlreadyExists", 409);
    }

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

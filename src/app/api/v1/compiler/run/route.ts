import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { forbidden } from "@/lib/api/auth";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isJudgeLanguage } from "@/lib/judge/languages";
import { executeCompilerRun } from "@/lib/compiler/execute";
import { resolveCapabilities } from "@/lib/capabilities";

const MAX_SOURCE_CODE_LENGTH = 64 * 1024; // 64KB
const MAX_STDIN_LENGTH = 64 * 1024; // 64KB

const compilerRunSchema = z.object({
  language: z.string().min(1),
  sourceCode: z.string().min(1).max(MAX_SOURCE_CODE_LENGTH),
  stdin: z.string().max(MAX_STDIN_LENGTH).default(""),
});

export const POST = createApiHandler({
  auth: true,
  rateLimit: "compiler:run",
  schema: compilerRunSchema,
  handler: async (_req, { user, body }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("content.submit_solutions")) {
      return forbidden();
    }

    // Validate language exists in judge language definitions
    if (!isJudgeLanguage(body.language)) {
      return apiError("languageNotFound", 404, "language");
    }

    const langConfig = await db.query.languageConfigs.findFirst({
      where: eq(languageConfigs.language, body.language),
      columns: {
        extension: true,
        dockerImage: true,
        compileCommand: true,
        runCommand: true,
        isEnabled: true,
      },
    });

    // Language not found in DB
    if (!langConfig) {
      return apiError("languageNotFound", 404, "language");
    }

    // Language exists but is disabled
    if (!langConfig.isEnabled) {
      return apiError("languageDisabled", 400, "language");
    }

    // Validate required fields are present (defensive check)
    if (!langConfig.extension || !langConfig.dockerImage || !langConfig.runCommand) {
      return apiError("internalServerError", 500);
    }

    const result = await executeCompilerRun({
      sourceCode: body.sourceCode,
      stdin: body.stdin,
      language: {
        extension: langConfig.extension,
        dockerImage: langConfig.dockerImage.trim(),
        compileCommand: langConfig.compileCommand?.trim() || null,
        runCommand: langConfig.runCommand.trim(),
      },
    });

    return apiSuccess(result);
  },
});

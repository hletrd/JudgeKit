import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isJudgeLanguage, getJudgeLanguageDefinition, serializeJudgeCommand } from "@/lib/judge/languages";
import { executeCompilerRun } from "@/lib/compiler/execute";

const MAX_SOURCE_CODE_LENGTH = 64 * 1024;
const MAX_STDIN_LENGTH = 64 * 1024 - 1; // -1 to account for the appended newline in executeCompilerRun

const playgroundRunSchema = z.object({
  language: z.string().min(1),
  sourceCode: z.string().min(1).max(MAX_SOURCE_CODE_LENGTH),
  stdin: z.string().max(MAX_STDIN_LENGTH).default(""),
});

export const POST = createApiHandler({
  auth: { capabilities: ["content.submit_solutions"] },
  rateLimit: "playground:run",
  schema: playgroundRunSchema,
  handler: async (_req, { body }) => {
    if (!isJudgeLanguage(body.language)) {
      return apiError("languageNotFound", 404, "language");
    }

    const [langConfig] = await db
      .select({
        extension: languageConfigs.extension,
        dockerImage: languageConfigs.dockerImage,
        compileCommand: languageConfigs.compileCommand,
        runCommand: languageConfigs.runCommand,
        isEnabled: languageConfigs.isEnabled,
      })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, body.language))
      .limit(1);

    if (!langConfig) {
      return apiError("languageNotFound", 404, "language");
    }

    if (!langConfig.isEnabled) {
      return apiError("languageDisabled", 400, "language");
    }

    const langDef = getJudgeLanguageDefinition(body.language);
    const extension = langConfig.extension || langDef?.extension;
    const dockerImage = langConfig.dockerImage || langDef?.dockerImage;
    const runCommand = langConfig.runCommand || (langDef ? langDef.runCommand.join(" ") : null);
    const compileCommand = langConfig.compileCommand || serializeJudgeCommand(langDef?.compileCommand);

    if (!extension || !dockerImage || !runCommand) {
      return apiError("internalServerError", 500);
    }

    const result = await executeCompilerRun({
      sourceCode: body.sourceCode,
      stdin: body.stdin,
      language: {
        extension,
        dockerImage: dockerImage.trim(),
        compileCommand: compileCommand?.trim() || null,
        runCommand: runCommand.trim(),
      },
    });

    return apiSuccess(result);
  },
});

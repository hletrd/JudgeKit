import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isJudgeLanguage, getJudgeLanguageDefinition, serializeJudgeCommand } from "@/lib/judge/languages";
import { executeCompilerRun } from "@/lib/compiler/execute";
import { getPlatformModePolicy } from "@/lib/platform-mode";
import { getEffectivePlatformMode } from "@/lib/platform-mode-context";

const MAX_SOURCE_CODE_BYTES = 64 * 1024;
const MAX_STDIN_BYTES = 64 * 1024; // execution layer also appends newline, but API layer checks raw input

const playgroundRunSchema = z.object({
  language: z.string().min(1),
  sourceCode: z.string().min(1).refine(
    (v) => Buffer.byteLength(v, "utf8") <= MAX_SOURCE_CODE_BYTES,
    { message: "sourceCodeTooLarge" }
  ),
  stdin: z.string().refine(
    (v) => Buffer.byteLength(v, "utf8") <= MAX_STDIN_BYTES,
    { message: "stdinTooLarge" }
  ).default(""),
});

export const POST = createApiHandler({
  auth: { capabilities: ["content.submit_solutions"] },
  rateLimit: "playground:run",
  schema: playgroundRunSchema,
  handler: async (_req, { user, body }) => {
    // Order matters: platform-mode check first so recruiting candidates and
    // contest-mode users get the actionable "compilerDisabledInCurrentMode"
    // response instead of the SEC H-1/H-2 emailVerificationRequired gate
    // (which they cannot satisfy because their account is provisioned via
    // recruiting invitation, never email-verified).
    const platformMode = await getEffectivePlatformMode({
      userId: user.id,
      assignmentId: null,
    });
    if (getPlatformModePolicy(platformMode).restrictStandaloneCompiler) {
      return apiError("compilerDisabledInCurrentMode", 403);
    }

    // SEC H-1 / H-2: gate sandbox-heavy endpoints behind email verification
    // and a per-user daily quota. Public signup + playground was the path
    // an attacker could use to spin up a Docker-mining farm; the email-
    // verified gate stops disposable accounts and the daily cap bounds
    // damage from a single legit-but-abusive user.
    const { gateSandboxEndpoint } = await import("@/lib/security/sandbox-gate");
    const sandboxGate = await gateSandboxEndpoint({
      userId: user.id,
      endpoint: "playground:run",
      maxPerDay: 200,
    });
    if (sandboxGate) return sandboxGate;

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

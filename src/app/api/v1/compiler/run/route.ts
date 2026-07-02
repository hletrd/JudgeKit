import { createApiHandler } from "@/lib/api/handler";
import { apiSuccess, apiError } from "@/lib/api/responses";
import { forbidden } from "@/lib/api/auth";
import { db } from "@/lib/db";
import { languageConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isJudgeLanguage, getJudgeLanguageDefinition, serializeJudgeCommand } from "@/lib/judge/languages";
import { executeCompilerRun } from "@/lib/compiler/execute";
import { resolveCapabilities } from "@/lib/capabilities";
import { getEffectiveModeRestrictions } from "@/lib/system-settings";
import { hasNoRawNul } from "@/lib/validators/api";
import {
  getEffectivePlatformMode,
  resolvePlatformModeAssignmentContextDetails,
} from "@/lib/platform-mode-context";
import { logger } from "@/lib/logger";

const MAX_SOURCE_CODE_BYTES = 64 * 1024; // 64KB
const MAX_STDIN_BYTES = 64 * 1024; // 64KB

const compilerRunSchema = z.object({
  language: z.string().min(1),
  sourceCode: z.string().min(1).refine(
    (v) => Buffer.byteLength(v, "utf8") <= MAX_SOURCE_CODE_BYTES,
    { message: "sourceCodeTooLarge" }
  ).refine(
    hasNoRawNul,
    { message: "sourceCodeInvalid" }
  ),
  stdin: z.string().refine(
    (v) => Buffer.byteLength(v, "utf8") <= MAX_STDIN_BYTES,
    { message: "stdinTooLarge" }
  ).default(""),
  assignmentId: z.string().max(100).nullish(),
});

export const POST = createApiHandler({
  auth: true,
  rateLimit: "compiler:run",
  schema: compilerRunSchema,
  handler: async (_req, { user, body }) => {
    // Order matters: platform-mode check first so recruiting candidates and
    // contest-mode users get the actionable "compilerDisabledInCurrentMode"
    // response instead of the SEC H-1/H-2 emailVerificationRequired gate
    // (which they cannot satisfy because their account is provisioned via
    // recruiting invitation, never email-verified).
    const assignmentContext = await resolvePlatformModeAssignmentContextDetails({
      userId: user.id,
      assignmentId: body.assignmentId ?? null,
    });
    if (assignmentContext.mismatch) {
      logger.warn(
        {
          userId: user.id,
          providedAssignmentId: assignmentContext.mismatch.providedAssignmentId,
          resolvedAssignmentId: assignmentContext.mismatch.resolvedAssignmentId,
          reason: assignmentContext.mismatch.reason,
        },
        "Compiler run derived a more restrictive assignment context than the client provided"
      );
    }

    const platformMode = await getEffectivePlatformMode({
      userId: user.id,
      assignmentId: assignmentContext.assignmentId,
    });
    if ((await getEffectiveModeRestrictions(platformMode)).restrictStandaloneCompiler) {
      return apiError("compilerDisabledInCurrentMode", 403);
    }

    // Capability gate must run before the sandbox-quota gate so callers without
    // content.submit_solutions are rejected with 403 without consuming quota.
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("content.submit_solutions")) {
      return forbidden();
    }

    // SEC H-1 / H-2: gate sandbox-heavy endpoint. Same shape as
    // /api/v1/playground/run. Compiler is reachable from assignment
    // workspaces (legitimate per-test debugging) so the daily ceiling
    // is higher than playground's, but the email-verified gate still
    // closes off disposable-signup abuse.
    const { gateSandboxEndpoint } = await import("@/lib/security/sandbox-gate");
    const sandboxGate = await gateSandboxEndpoint({
      userId: user.id,
      endpoint: "compiler:run",
      maxPerDay: 500,
    });
    if (sandboxGate) return sandboxGate;

    // Validate language exists in judge language definitions
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

    // Language not found in DB
    if (!langConfig) {
      return apiError("languageNotFound", 404, "language");
    }

    // Language exists but is disabled
    if (!langConfig.isEnabled) {
      return apiError("languageDisabled", 400, "language");
    }

    // Fall back to built-in language definitions when DB fields are empty
    const langDef = getJudgeLanguageDefinition(body.language);
    const extension = langConfig.extension || langDef?.extension;
    const dockerImage = langConfig.dockerImage || langDef?.dockerImage;
    const runCommand = langConfig.runCommand || serializeJudgeCommand(langDef?.runCommand);
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
        id: body.language,
      },
    });

    return apiSuccess(result);
  },
});

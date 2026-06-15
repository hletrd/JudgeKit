import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { languageConfigs, problems, testCases } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { createApiHandler, forbidden, notFound } from "@/lib/api/handler";
import { apiError, apiSuccess } from "@/lib/api/responses";
import { canManageProblem } from "@/lib/auth/permissions";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import {
  isJudgeLanguage,
  getJudgeLanguageDefinition,
  serializeJudgeCommand,
} from "@/lib/judge/languages";
import { executeCompilerRun } from "@/lib/compiler/execute";
import { assembleFunctionSubmission } from "@/lib/judge/function-judging/assemble";
import { supportsFunctionJudging } from "@/lib/judge/function-judging/registry";
import { parseFunctionSpec } from "@/lib/judge/function-judging/types";
import { logger } from "@/lib/logger";

/**
 * POST /api/v1/problems/[id]/compute-expected
 *
 * Author-only. For a function-signature problem, assembles its reference
 * solution into a full stdin/stdout compile unit and runs it against every
 * test case's input (stdin) using the SAME single-run execution mechanism the
 * playground / standalone compiler uses (`executeCompilerRun`). The produced
 * stdout becomes each case's computed `expectedOutput`.
 *
 * Per-case failures are reported (ok=false + error) rather than swallowed; a
 * single failing case never aborts the others.
 */
export const POST = createApiHandler({
  rateLimit: "problems:update",
  handler: async (_req: NextRequest, { user, params }) => {
    const { id } = params;

    const problem = await db.query.problems.findFirst({
      where: eq(problems.id, id),
      columns: {
        id: true,
        authorId: true,
        problemType: true,
        functionSpec: true,
        referenceSolution: true,
      },
    });
    if (!problem) return notFound("Problem");

    // Author-capability gate — same shape the problem-edit (PATCH) route uses:
    // the problems.edit capability OR ownership, then a group-scope check.
    const caps = await resolveCapabilities(user.role);
    const isAuthor = problem.authorId === user.id;
    if (!isAuthor && !caps.has("problems.edit")) return forbidden();
    if (!(await canManageProblem(id, user.id, user.role))) return forbidden();

    if (problem.problemType !== "function") {
      return apiError("notAFunctionProblem", 400);
    }
    if (!problem.functionSpec) {
      return apiError("functionSpecRequired", 400);
    }
    if (!problem.referenceSolution) {
      return apiError("referenceSolutionRequired", 400);
    }

    const refLanguage = problem.referenceSolution.language;
    if (!supportsFunctionJudging(refLanguage) || !isJudgeLanguage(refLanguage)) {
      return apiError("unsupportedReferenceLanguage", 400);
    }

    let spec;
    let assembledSource: string;
    try {
      spec = parseFunctionSpec(problem.functionSpec);
      assembledSource = assembleFunctionSubmission(
        spec,
        refLanguage,
        problem.referenceSolution.source,
      ).source;
    } catch (error) {
      logger.warn({ error, problemId: id }, "[compute-expected] Failed to assemble reference solution");
      return apiError("functionSpecRequired", 400);
    }

    // Resolve the language config exactly like /api/v1/compiler/run: DB config
    // first, falling back to the built-in judge language definition.
    const [langConfig] = await db
      .select({
        extension: languageConfigs.extension,
        dockerImage: languageConfigs.dockerImage,
        compileCommand: languageConfigs.compileCommand,
        runCommand: languageConfigs.runCommand,
        isEnabled: languageConfigs.isEnabled,
      })
      .from(languageConfigs)
      .where(eq(languageConfigs.language, refLanguage))
      .limit(1);

    const langDef = getJudgeLanguageDefinition(refLanguage);
    const extension = langConfig?.extension || langDef?.extension;
    const dockerImage = langConfig?.dockerImage || langDef?.dockerImage;
    const runCommand = langConfig?.runCommand || (langDef ? langDef.runCommand.join(" ") : null);
    const compileCommand = langConfig?.compileCommand || serializeJudgeCommand(langDef?.compileCommand);

    if (!extension || !dockerImage || !runCommand) {
      return apiError("unsupportedReferenceLanguage", 400);
    }

    const cases = await db.query.testCases.findMany({
      where: eq(testCases.problemId, id),
      orderBy: [asc(testCases.sortOrder), asc(testCases.id)],
    });

    const language = {
      extension,
      dockerImage: dockerImage.trim(),
      compileCommand: compileCommand?.trim() || null,
      runCommand: runCommand.trim(),
    };

    const results: Array<{
      testCaseIndex: number;
      input: string;
      expectedOutput: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const [index, testCase] of cases.entries()) {
      try {
        const run = await executeCompilerRun({
          sourceCode: assembledSource,
          stdin: testCase.input ?? "",
          language,
        });

        if (run.compileOutput) {
          results.push({
            testCaseIndex: index,
            input: testCase.input ?? "",
            expectedOutput: "",
            ok: false,
            error: run.compileOutput,
          });
          continue;
        }
        if (run.timedOut) {
          results.push({
            testCaseIndex: index,
            input: testCase.input ?? "",
            expectedOutput: "",
            ok: false,
            error: "timedOut",
          });
          continue;
        }
        if (run.exitCode !== 0) {
          results.push({
            testCaseIndex: index,
            input: testCase.input ?? "",
            expectedOutput: run.stdout,
            ok: false,
            error: run.stderr || `exitCode ${run.exitCode ?? "null"}`,
          });
          continue;
        }

        results.push({
          testCaseIndex: index,
          input: testCase.input ?? "",
          expectedOutput: run.stdout,
          ok: true,
        });
      } catch (error) {
        logger.warn({ error, problemId: id, testCaseIndex: index }, "[compute-expected] Run failed");
        results.push({
          testCaseIndex: index,
          input: testCase.input ?? "",
          expectedOutput: "",
          ok: false,
          error: error instanceof Error ? error.message : "runFailed",
        });
      }
    }

    return apiSuccess({ results });
  },
});

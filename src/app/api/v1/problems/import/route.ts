import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess } from "@/lib/api/responses";
import { createApiHandler, forbidden } from "@/lib/api/handler";
import { createProblemWithTestCases } from "@/lib/problem-management";
import { resolveCapabilities } from "@/lib/capabilities/cache";
import { functionSpecSchema } from "@/lib/judge/function-judging/types";
import { supportsFunctionJudging } from "@/lib/judge/function-judging/registry";
import {
  problemDescriptionSchema,
  problemTestCaseSchema,
  referenceSolutionSchema,
} from "@/lib/validators/problem-management";

export const problemImportSchema = z.object({
  version: z.number().optional(),
  problem: z.object({
    title: z.string().min(1).max(200),
    description: problemDescriptionSchema,
    sequenceNumber: z.number().int().min(0).nullable().optional(),
    timeLimitMs: z.number().int().min(100).max(10000).default(1000),
    memoryLimitMb: z.number().int().min(16).max(1024).default(256),
    problemType: z.enum(["auto", "manual", "function"]).default("auto"),
    visibility: z.enum(["public", "private", "hidden"]).default("private"),
    showCompileOutput: z.boolean().default(true),
    showDetailedResults: z.boolean().default(true),
    showRuntimeErrors: z.boolean().default(true),
    allowAiAssistant: z.boolean().default(true),
    comparisonMode: z.enum(["exact", "float"]).default("exact"),
    floatAbsoluteError: z.number().min(0).max(1).nullable().optional(),
    floatRelativeError: z.number().min(0).max(1).nullable().optional(),
    difficulty: z.number().min(0).max(10).nullable().optional(),
    functionSpec: functionSpecSchema.nullable().optional(),
    referenceSolution: referenceSolutionSchema.nullable().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).default([]),
    testCases: z.array(
      problemTestCaseSchema.extend({
        sortOrder: z.number().int().optional(),
      })
    ).max(100, "tooManyTestCases").default([]),
  }).superRefine((problem, ctx) => {
    if (problem.problemType !== "function") return;

    if (problem.functionSpec == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "functionSpecRequired",
        path: ["functionSpec"],
      });
      return;
    }

    if (!problem.functionSpec.enabledLanguages.some(supportsFunctionJudging)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "functionSpecUnsupportedLanguages",
        path: ["functionSpec", "enabledLanguages"],
      });
    }
  }),
});

export const POST = createApiHandler({
  rateLimit: "problems:create",
  schema: problemImportSchema,
  handler: async (_req: NextRequest, { user, body }) => {
    const caps = await resolveCapabilities(user.role);
    if (!caps.has("problems.create")) return forbidden();

    const { problem } = body;

    const problemId = await createProblemWithTestCases(
      {
        title: problem.title,
        description: problem.description,
        sequenceNumber: problem.sequenceNumber ?? null,
        problemType: problem.problemType ?? "auto",
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        visibility: problem.visibility,
        showCompileOutput: problem.showCompileOutput,
        showDetailedResults: problem.showDetailedResults,
        showRuntimeErrors: problem.showRuntimeErrors,
        allowAiAssistant: problem.allowAiAssistant,
        comparisonMode: problem.comparisonMode,
        floatAbsoluteError: problem.floatAbsoluteError ?? null,
        floatRelativeError: problem.floatRelativeError ?? null,
        difficulty: problem.difficulty ?? null,
        functionSpec: problem.problemType === "function" ? problem.functionSpec ?? null : null,
        referenceSolution: problem.problemType === "function" ? problem.referenceSolution ?? null : null,
        tags: problem.tags,
        testCases: problem.testCases.map((tc) => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          isVisible: tc.isVisible,
        })),
      },
      user.id
    );

    return apiSuccess({ id: problemId }, { status: 201 });
  },
});

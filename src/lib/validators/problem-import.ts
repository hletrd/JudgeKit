import { z } from "zod";
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

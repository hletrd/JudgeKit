import { z } from "zod";
import { trimString } from "@/lib/validators/preprocess";
import { functionSpecSchema } from "@/lib/judge/function-judging/types";
import { supportsFunctionJudging } from "@/lib/judge/function-judging/registry";

export const problemVisibilityValues = ["public", "private", "hidden"] as const;
export const problemTypeValues = ["auto", "manual", "function"] as const;

export const problemTestCaseSchema = z.object({
  input: z.string().default(""),
  expectedOutput: z.string().min(1, "testCaseOutputRequired"),
  isVisible: z.boolean().default(false),
});

const REQUIRED_DESCRIPTION_SECTIONS = [
  /^#{2,4}\s*(?:문제|Problem(?:\s+Statement)?)\s*$/im,
  /^#{2,4}\s*(?:입력|Input(?:\s+Format)?)\s*$/im,
  /^#{2,4}\s*(?:출력|Output(?:\s+Format)?)\s*$/im,
  /^#{2,4}\s*(?:제한|Constraints?)\s*$/im,
  /^#{2,4}\s*(?:입출력\s*예시|Examples?)\s*$/im,
] as const;

function validateProblemDescriptionMarkdown(
  value: string,
  ctx: z.RefinementCtx
) {
  const description = value.trim();

  if (description.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "descriptionRequired",
    });
    return;
  }

  if (/<\/?[a-z][\s\S]*?>/i.test(description)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "descriptionMarkdownOnly",
    });
  }

  if (!REQUIRED_DESCRIPTION_SECTIONS.every((pattern) => pattern.test(description))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "descriptionFormatRequired",
    });
  }

  const fenceCount = description.match(/```/g)?.length ?? 0;
  if (fenceCount < 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "descriptionExampleRequired",
    });
  }
}

export const problemDescriptionSchema = z.preprocess(
  (value) => value == null ? "" : value,
  z.string()
    .max(50000, "descriptionTooLong")
    .superRefine(validateProblemDescriptionMarkdown)
);

/**
 * Author-only reference solution used to compute expected outputs for
 * function-signature problems. Never exposed to students.
 */
export const referenceSolutionSchema = z.object({
  // Must be one of the languages that ship a function-judging harness adapter,
  // since the reference solution is assembled + executed via that harness.
  language: z.string().refine(supportsFunctionJudging, "unsupportedReferenceLanguage"),
  source: z.string(),
});

/**
 * Enforces the type-conditional shape for function-signature judging:
 * when `problemType === "function"` a valid `functionSpec` is REQUIRED;
 * otherwise `functionSpec` / `referenceSolution` are ignored downstream
 * (the mutation helpers null them out unless problemType is "function").
 */
function refineFunctionProblem(
  data: { problemType?: string; functionSpec?: unknown },
  ctx: z.RefinementCtx
) {
  if (data.problemType !== "function") {
    return;
  }

  if (data.functionSpec == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "functionSpecRequired",
      path: ["functionSpec"],
    });
    return;
  }

  const parsedSpec = functionSpecSchema.safeParse(data.functionSpec);
  if (!parsedSpec.success) {
    return;
  }

  if (!parsedSpec.data.enabledLanguages.some(supportsFunctionJudging)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "functionSpecUnsupportedLanguages",
      path: ["functionSpec", "enabledLanguages"],
    });
  }
}

export const problemMutationSchema = z.object({
  title: z.preprocess(trimString, z.string().min(1, "titleRequired").max(200, "titleTooLong")),
  description: problemDescriptionSchema,
  sequenceNumber: z.number().int().min(0).nullable().optional(),
  timeLimitMs: z.number().int().min(100, "invalidTimeLimit").max(10000, "invalidTimeLimit"),
  memoryLimitMb: z.number().int().min(16, "invalidMemoryLimit").max(1024, "invalidMemoryLimit"),
  problemType: z.enum(problemTypeValues).optional().default("auto"),
  visibility: z.enum(problemVisibilityValues),
  showCompileOutput: z.boolean().optional().default(true),
  showDetailedResults: z.boolean().optional().default(true),
  showRuntimeErrors: z.boolean().optional().default(true),
  allowAiAssistant: z.boolean().optional().default(true),
  comparisonMode: z.enum(["exact", "float"]).optional().default("exact"),
  floatAbsoluteError: z.number().min(0).max(1).optional().nullable(),
  floatRelativeError: z.number().min(0).max(1).optional().nullable(),
  difficulty: z.number().min(0, "invalidDifficulty").max(10, "invalidDifficulty").nullable().optional()
    .transform((v) => v != null ? Math.round(v * 100) / 100 : v),
  defaultLanguage: z.string().max(50).nullable().optional(),
  functionSpec: functionSpecSchema.nullable().optional(),
  referenceSolution: referenceSolutionSchema.nullable().optional(),
  testCases: z.array(problemTestCaseSchema).max(100, "tooManyTestCases").default([]),
  tags: z.array(z.string().min(1).max(50)).max(20, "tooManyTags").default([]),
}).superRefine(refineFunctionProblem);

/**
 * Schema for the raw request body of POST /api/v1/problems.
 * Unlike problemMutationSchema, timeLimitMs/memoryLimitMb/visibility are
 * optional with defaults so clients can omit them on creation.
 */
export const problemCreateSchema = z.object({
  title: z.preprocess(trimString, z.string().min(1, "titleRequired").max(200, "titleTooLong")),
  description: problemDescriptionSchema,
  sequenceNumber: z.number().int().min(0).nullable().optional(),
  problemType: z.enum(problemTypeValues).optional().default("auto"),
  timeLimitMs: z.number().int().min(100, "invalidTimeLimit").max(10000, "invalidTimeLimit").optional().default(2000),
  memoryLimitMb: z.number().int().min(16, "invalidMemoryLimit").max(1024, "invalidMemoryLimit").optional().default(256),
  visibility: z.enum(problemVisibilityValues).optional().default("private"),
  showCompileOutput: z.boolean().optional(),
  showDetailedResults: z.boolean().optional(),
  showRuntimeErrors: z.boolean().optional(),
  allowAiAssistant: z.boolean().optional(),
  comparisonMode: z.enum(["exact", "float"]).optional().default("exact"),
  floatAbsoluteError: z.number().min(0).max(1).optional().nullable(),
  floatRelativeError: z.number().min(0).max(1).optional().nullable(),
  difficulty: z.number().min(0, "invalidDifficulty").max(10, "invalidDifficulty").nullable().optional()
    .transform((v) => v != null ? Math.round(v * 100) / 100 : v),
  defaultLanguage: z.string().max(50).nullable().optional(),
  functionSpec: functionSpecSchema.nullable().optional(),
  referenceSolution: referenceSolutionSchema.nullable().optional(),
  testCases: z.array(problemTestCaseSchema).max(100, "tooManyTestCases").optional().default([]),
  tags: z.array(z.string().min(1).max(50)).max(20, "tooManyTags").optional().default([]),
}).superRefine(refineFunctionProblem);

export type ProblemTestCaseInput = z.infer<typeof problemTestCaseSchema>;
export type ProblemMutationInput = z.infer<typeof problemMutationSchema>;
export type ProblemCreateInput = z.infer<typeof problemCreateSchema>;

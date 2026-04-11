import { z } from "zod";
import { trimString } from "@/lib/validators/preprocess";

export const problemVisibilityValues = ["public", "private", "hidden"] as const;
export const problemTypeValues = ["auto", "manual"] as const;

export const problemTestCaseSchema = z.object({
  input: z.string().default(""),
  expectedOutput: z.string().min(1, "testCaseOutputRequired"),
  isVisible: z.boolean().default(false),
});

export const problemMutationSchema = z.object({
  title: z.preprocess(trimString, z.string().min(1, "titleRequired").max(200, "titleTooLong")),
  description: z.string().max(50000, "descriptionTooLong").default(""),
  sequenceNumber: z.number().int().min(1).nullable().optional(),
  timeLimitMs: z.number().int().min(100, "invalidTimeLimit").max(10000, "invalidTimeLimit"),
  memoryLimitMb: z.number().int().min(16, "invalidMemoryLimit").max(2048, "invalidMemoryLimit"),
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
  testCases: z.array(problemTestCaseSchema).max(100, "tooManyTestCases").default([]),
  tags: z.array(z.string().min(1).max(50)).max(20, "tooManyTags").default([]),
});

export type ProblemTestCaseInput = z.infer<typeof problemTestCaseSchema>;
export type ProblemMutationInput = z.infer<typeof problemMutationSchema>;

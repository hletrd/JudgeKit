import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";
import { getMaxSourceCodeSizeBytes } from "@/lib/security/constants";

export const submissionCreateSchema = z.object({
  problemId: z.preprocess(trimString, z.string().min(1, "problemRequired")),
  language: z.preprocess(trimString, z.string().min(1, "languageRequired")),
  sourceCode: z
    .string()
    .min(1, "sourceCodeRequired")
    .max(getMaxSourceCodeSizeBytes(), "sourceCodeTooLarge")
    // Reject NUL bytes (U+0000): no language's source legitimately contains a
    // raw NUL, and embedded NULs can truncate or corrupt downstream string
    // handling in compilers and the judge worker (SEC6-2). Fail closed at the
    // boundary rather than relying on per-language tolerance.
    .refine((value) => !value.includes("\u0000"), "sourceCodeInvalid"),
  assignmentId: z.preprocess(
    normalizeOptionalString,
    z.string().min(1, "invalidAssignmentId").nullable().optional()
  ),
});

const judgeResultItemSchema = z.object({
  testCaseId: z.preprocess(trimString, z.string().min(1, "invalidJudgeResult")),
  status: z.preprocess(trimString, z.string().min(1, "invalidJudgeResult")),
  actualOutput: z.string().optional(),
  executionTimeMs: z.number().int().nonnegative().optional(),
  memoryUsedKb: z.number().int().nonnegative().optional(),
  runtimeErrorType: z.preprocess(
    normalizeOptionalString,
    z.string().min(1, "invalidJudgeResult").optional()
  ),
});

export const judgeStatusReportSchema = z.object({
  submissionId: z.preprocess(trimString, z.string().min(1, "submissionIdRequired")),
  claimToken: z.preprocess(trimString, z.string().min(1, "claimTokenRequired")),
  status: z.preprocess(trimString, z.string().min(1, "statusRequired")),
  compileOutput: z.string().optional(),
  results: z.array(judgeResultItemSchema).optional(),
});

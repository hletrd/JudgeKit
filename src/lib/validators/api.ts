import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";
import { getMaxSourceCodeSizeBytes } from "@/lib/security/constants";

export const submissionCreateSchema = z.object({
  problemId: z.preprocess(trimString, z.string().min(1, "problemRequired")),
  language: z.preprocess(trimString, z.string().min(1, "languageRequired")),
  sourceCode: z.string().min(1, "sourceCodeRequired").max(getMaxSourceCodeSizeBytes(), "sourceCodeTooLarge"),
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
});

export const judgeStatusReportSchema = z.object({
  submissionId: z.preprocess(trimString, z.string().min(1, "submissionIdRequired")),
  claimToken: z.preprocess(trimString, z.string().min(1, "claimTokenRequired")),
  status: z.preprocess(trimString, z.string().min(1, "statusRequired")),
  compileOutput: z.string().optional(),
  results: z.array(judgeResultItemSchema).optional(),
});

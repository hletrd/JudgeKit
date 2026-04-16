import { z } from "zod";

export const contestClarificationCreateSchema = z.object({
  problemId: z.string().trim().min(1).nullable().optional(),
  question: z.string().trim().min(1, "clarificationQuestionRequired").max(10000, "clarificationQuestionTooLong"),
});

export const contestClarificationUpdateSchema = z
  .object({
    answer: z.string().trim().min(1, "clarificationAnswerRequired").max(10000, "clarificationAnswerTooLong").optional(),
    answerType: z.enum(["yes", "no", "no_comment", "custom"]).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((value) => value.answer !== undefined || value.answerType !== undefined || value.isPublic !== undefined, {
    message: "clarificationUpdateRequired",
  });

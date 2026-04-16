import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";

export const problemSetMutationSchema = z
  .object({
    name: z.preprocess(
      trimString,
      z.string().min(1, "problemSetNameRequired").max(200, "problemSetNameTooLong")
    ),
    description: z.preprocess(
      normalizeOptionalString,
      z.string().max(2000, "problemSetDescriptionTooLong").optional()
    ),
    isPublic: z.boolean().optional(),
    problemIds: z
      .array(z.preprocess(trimString, z.string().min(1)))
      .max(200, "tooManyProblemSetProblems")
      .default([]),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.problemIds.forEach((id, index) => {
      if (seen.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "problemSetProblemDuplicate",
          path: ["problemIds", index],
        });
        return;
      }
      seen.add(id);
    });
  });

export const problemSetGroupAssignSchema = z.object({
  groupIds: z
    .array(z.preprocess(trimString, z.string().min(1)))
    .min(1, "problemSetGroupRequired")
    .max(100, "tooManyProblemSetGroups"),
});

export type ProblemSetMutationInput = z.infer<typeof problemSetMutationSchema>;
export type ProblemSetGroupAssignInput = z.infer<typeof problemSetGroupAssignSchema>;

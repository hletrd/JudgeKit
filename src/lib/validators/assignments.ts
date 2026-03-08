import { z } from "zod";

function trimString(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export const assignmentProblemSchema = z.object({
  problemId: z.preprocess(trimString, z.string().min(1, "assignmentProblemRequired")),
  points: z
    .number()
    .int("assignmentPointsInvalid")
    .min(1, "assignmentPointsInvalid")
    .max(10000, "assignmentPointsInvalid"),
});

export const assignmentMutationSchema = z
  .object({
    title: z.preprocess(
      trimString,
      z.string().min(1, "assignmentTitleRequired").max(200, "assignmentTitleTooLong")
    ),
    description: z.preprocess(
      normalizeOptionalString,
      z.string().max(5000, "assignmentDescriptionTooLong").optional()
    ),
    startsAt: z.number().int().nullable().optional(),
    deadline: z.number().int().nullable().optional(),
    lateDeadline: z.number().int().nullable().optional(),
    latePenalty: z
      .number()
      .min(0, "assignmentLatePenaltyInvalid")
      .max(100, "assignmentLatePenaltyInvalid")
      .default(0),
    problems: z
      .array(assignmentProblemSchema)
      .min(1, "assignmentProblemRequired")
      .max(100, "tooManyAssignmentProblems"),
  })
  .superRefine((value, context) => {
    const seenProblemIds = new Set<string>();

    value.problems.forEach((problem, index) => {
      if (seenProblemIds.has(problem.problemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "assignmentProblemDuplicate",
          path: ["problems", index, "problemId"],
        });
        return;
      }

      seenProblemIds.add(problem.problemId);
    });

    if (value.startsAt && value.deadline && value.startsAt > value.deadline) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assignmentScheduleInvalid",
        path: ["deadline"],
      });
    }

    if (value.deadline && value.lateDeadline && value.deadline > value.lateDeadline) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assignmentLateDeadlineInvalid",
        path: ["lateDeadline"],
      });
    }
  });

export type AssignmentProblemInput = z.infer<typeof assignmentProblemSchema>;
export type AssignmentMutationInput = z.infer<typeof assignmentMutationSchema>;

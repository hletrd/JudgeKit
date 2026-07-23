import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";

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
    examMode: z.enum(["none", "scheduled", "windowed"]).default("none"),
    visibility: z.enum(["private", "public"]).default("private"),
    examDurationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    scoringModel: z.enum(["ioi", "icpc"]).default("ioi"),
    aiAssistantPolicy: z.enum(["inherit", "allow", "forbid"]).default("inherit"),
    freezeLeaderboardAt: z.number().int().nullable().optional(),
    enableAntiCheat: z.boolean().default(false),
    showResultsToCandidate: z.boolean().default(false),
    hideScoresFromCandidates: z.boolean().default(false),
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

    if (value.startsAt && value.deadline && value.startsAt >= value.deadline) {
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

    // A leaderboard freeze only makes sense strictly inside the contest window.
    // Before startsAt it freezes nothing; at/after deadline it freezes the whole
    // contest — both silently defeat the feature, so reject the misconfiguration.
    if (value.freezeLeaderboardAt != null) {
      const beforeStart = value.startsAt != null && value.freezeLeaderboardAt < value.startsAt;
      const afterDeadline = value.deadline != null && value.freezeLeaderboardAt >= value.deadline;
      if (beforeStart || afterDeadline) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "freezeLeaderboardOutOfRange",
          path: ["freezeLeaderboardAt"],
        });
      }
    }

    // Exam mode cross-field validation
    if (value.examMode === "windowed") {
      if (!value.examDurationMinutes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "examDurationRequired",
          path: ["examDurationMinutes"],
        });
      }
      if (!value.startsAt || !value.deadline) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "examWindowRequired",
          path: ["examMode"],
        });
      }
      // Windowed mode: clear late fields
      value.lateDeadline = null;
      value.latePenalty = 0;
    }

    if (value.examMode === "scheduled") {
      if (!value.startsAt || !value.deadline) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "examScheduleRequired",
          path: ["examMode"],
        });
      }
      // Scheduled mode: clear late fields (exams don't allow late submissions)
      value.lateDeadline = null;
      value.latePenalty = 0;
    }

    // Non-exam mode: clear duration
    if (value.examMode === "none") {
      value.examDurationMinutes = null;
    }
  });

/**
 * Schema for the raw request body of PATCH /api/v1/groups/[id]/assignments/[assignmentId].
 * All fields are optional (partial update). The `allowLockedProblems` flag
 * is a meta-field that does not appear in the mutation schema — it controls
 * whether the handler permits changing problem links after submissions exist.
 */
export const assignmentPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  startsAt: z.number().int().nullable().optional(),
  deadline: z.number().int().nullable().optional(),
  lateDeadline: z.number().int().nullable().optional(),
  latePenalty: z.number().min(0).max(100).optional(),
  examMode: z.enum(["none", "scheduled", "windowed"]).optional(),
  visibility: z.enum(["private", "public"]).optional(),
  examDurationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  scoringModel: z.enum(["ioi", "icpc"]).optional(),
  aiAssistantPolicy: z.enum(["inherit", "allow", "forbid"]).optional(),
  freezeLeaderboardAt: z.number().int().nullable().optional(),
  enableAntiCheat: z.boolean().optional(),
  showResultsToCandidate: z.boolean().optional(),
  hideScoresFromCandidates: z.boolean().optional(),
  problems: z.array(assignmentProblemSchema).min(1).max(100).optional(),
  allowLockedProblems: z.boolean().optional(),
}).strict();

export type AssignmentProblemInput = z.infer<typeof assignmentProblemSchema>;
export type AssignmentMutationInput = z.infer<typeof assignmentMutationSchema>;
export type AssignmentPatchInput = z.infer<typeof assignmentPatchSchema>;

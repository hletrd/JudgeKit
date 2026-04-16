import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";

export const discussionThreadCreateSchema = z.object({
  scopeType: z.enum(["general", "problem", "editorial"]),
  problemId: z.preprocess(normalizeOptionalString, z.string().min(1).nullable().optional()),
  title: z.preprocess(trimString, z.string().min(3, "discussionTitleRequired").max(200, "discussionTitleTooLong")),
  content: z.preprocess(trimString, z.string().min(1, "discussionContentRequired").max(5000, "discussionContentTooLong")),
}).superRefine((value, ctx) => {
  if ((value.scopeType === "problem" || value.scopeType === "editorial") && !value.problemId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "discussionProblemRequired",
      path: ["problemId"],
    });
  }

  if (value.scopeType === "general" && value.problemId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "discussionProblemNotAllowed",
      path: ["problemId"],
    });
  }
});

export const discussionPostCreateSchema = z.object({
  content: z.preprocess(trimString, z.string().min(1, "discussionContentRequired").max(5000, "discussionContentTooLong")),
});

export const communityVoteSchema = z.object({
  targetType: z.enum(["thread", "post"]),
  targetId: z.preprocess(trimString, z.string().min(1, "communityVoteTargetRequired")),
  voteType: z.enum(["up", "down"]),
});

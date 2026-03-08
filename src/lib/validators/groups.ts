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

export const createGroupSchema = z.object({
  name: z.preprocess(trimString, z.string().min(1, "nameRequired").max(100, "nameTooLong")),
  description: z.preprocess(
    normalizeOptionalString,
    z.string().max(500, "descriptionTooLong").optional()
  ),
});

export const groupMembershipSchema = z.object({
  userId: z.preprocess(trimString, z.string().min(1, "studentRequired")),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type GroupMembershipInput = z.infer<typeof groupMembershipSchema>;

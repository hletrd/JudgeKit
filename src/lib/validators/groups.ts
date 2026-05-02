import { z } from "zod";
import { normalizeOptionalString, trimString } from "@/lib/validators/preprocess";

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

export const updateGroupSchema = createGroupSchema.partial().extend({
  isArchived: z.boolean().optional(),
  instructorId: z.preprocess(
    normalizeOptionalString,
    z.string().min(1, "instructorRequired").optional()
  ),
});

// Bulk enrollment accepts either resolved userIds (legacy callers, dropdown
// picker) or usernames (CSV / paste-list). One of the two must be present;
// when both are provided usernames are resolved and merged with userIds.
export const bulkEnrollmentSchema = z
  .object({
    userIds: z.array(z.string().min(1)).max(500).optional(),
    usernames: z.array(z.string().min(1).max(50)).max(500).optional(),
  })
  .refine(
    (val) => (val.userIds?.length ?? 0) + (val.usernames?.length ?? 0) > 0,
    { message: "atLeastOneIdentifierRequired" },
  )
  .refine(
    (val) => (val.userIds?.length ?? 0) + (val.usernames?.length ?? 0) <= 500,
    { message: "tooManyIdentifiers" },
  );

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type GroupMembershipInput = z.infer<typeof groupMembershipSchema>;
export type BulkEnrollmentInput = z.infer<typeof bulkEnrollmentSchema>;

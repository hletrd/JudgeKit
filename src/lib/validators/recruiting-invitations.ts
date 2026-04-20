import { z } from "zod";

export const createRecruitingInvitationSchema = z.object({
  candidateName: z.string().min(1).max(255),
  candidateEmail: z.string().email().max(255),
  metadata: z.record(z.string(), z.string()).optional().default({}),
  expiryDays: z.number().int().min(1).max(3650).nullable().optional(),
  // For custom date selection: the client sends the date (YYYY-MM-DD) and the
  // server computes the end-of-day UTC timestamp.
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const updateRecruitingInvitationSchema = z.object({
  expiryDays: z.number().int().min(1).max(3650).nullable().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  status: z.enum(["revoked"]).optional(),
  resetAccountPassword: z.literal(true).optional(),
});

export const bulkCreateRecruitingInvitationsSchema = z.object({
  invitations: z.array(createRecruitingInvitationSchema).min(1).max(500),
});

export const validateRecruitingTokenSchema = z.object({
  token: z.string().min(1).max(64),
});

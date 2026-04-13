import { z } from "zod";

export const createRecruitingInvitationSchema = z.object({
  candidateName: z.string().min(1).max(255),
  candidateEmail: z.string().email().max(255),
  metadata: z.record(z.string(), z.string()).optional().default({}),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const updateRecruitingInvitationSchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
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

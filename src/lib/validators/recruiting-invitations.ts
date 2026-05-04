import { z } from "zod";

/**
 * Zod refinement that rejects metadata keys starting with the internal
 * "_sys." prefix. This is defense-in-depth — the runtime check in
 * recruiting-invitations.ts (findInternalKeyViolation) remains the
 * authoritative guard. The Zod-level check catches violations at the
 * API boundary with consistent 400 responses.
 */
const SYS_NAMESPACE_REJECT_MESSAGE = "Metadata keys starting with \"_sys.\" use a reserved prefix";

const sysNamespaceRefine = (metadata: Record<string, string> | undefined) => {
  if (!metadata) return true;
  for (const key of Object.keys(metadata)) {
    if (key.startsWith("_sys.")) {
      return false;
    }
  }
  return true;
};

export const createRecruitingInvitationSchema = z.object({
  candidateName: z.string().min(1).max(255),
  candidateEmail: z.string().email().max(255),
  metadata: z.record(z.string(), z.string())
    .optional().default({})
    .refine(sysNamespaceRefine, { message: SYS_NAMESPACE_REJECT_MESSAGE }),
  expiryDays: z.number().int().min(1).max(3650).nullable().optional(),
  // For custom date selection: the client sends the date (YYYY-MM-DD) and the
  // server computes the end-of-day UTC timestamp.
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const updateRecruitingInvitationSchema = z.object({
  expiryDays: z.number().int().min(1).max(3650).nullable().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metadata: z.record(z.string(), z.string())
    .optional()
    .refine(sysNamespaceRefine, { message: SYS_NAMESPACE_REJECT_MESSAGE }),
  status: z.enum(["revoked"]).optional(),
  resetAccountPassword: z.literal(true).optional(),
});

export const bulkCreateRecruitingInvitationsSchema = z.object({
  invitations: z.array(createRecruitingInvitationSchema).min(1).max(500),
});

export const validateRecruitingTokenSchema = z.object({
  token: z.string().min(1).max(64),
});

import { sendEmail, isEmailConfigured } from "@/lib/email/smtp";
import { renderRecruitingInvitationEmail } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

/**
 * Dispatch a recruiting-invitation email with the candidate's access link.
 *
 * Safe to call unconditionally and without awaiting (fire-and-forget): it
 * no-ops silently when SMTP is not enabled/configured, and all rendering/send
 * failures are caught and logged rather than thrown. Used by both the
 * invitation-create path and the link-regeneration ("re-issue") path so the two
 * share one gated, fault-tolerant delivery implementation.
 */
export async function dispatchRecruitingInvitationEmail(params: {
  to: string;
  candidateName: string;
  assessmentTitle: string;
  accessUrl: string;
  expiresAt: Date | null;
  assignmentId?: string;
}): Promise<void> {
  try {
    // Only ever send when SMTP is enabled AND configured.
    if (!(await isEmailConfigured())) return;
    const template = await renderRecruitingInvitationEmail({
      to: params.to,
      candidateName: params.candidateName,
      assessmentTitle: params.assessmentTitle,
      accessUrl: params.accessUrl,
      expiresAt: params.expiresAt,
    });
    await sendEmail({
      to: params.to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  } catch (error) {
    logger.warn(
      {
        assignmentId: params.assignmentId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Recruiting invitation email dispatch failed",
    );
  }
}

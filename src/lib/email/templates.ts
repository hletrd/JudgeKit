function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface PasswordResetEmail {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface EmailVerificationEmail {
  to: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export interface SiteEventEmail {
  to: string;
  eventType: string;
  title: string;
  details: string;
  severity: "info" | "warning" | "critical";
}

export interface RecruitingInvitationEmail {
  to: string;
  candidateName: string;
  assessmentTitle: string;
  accessUrl: string;
  expiresAt: Date | null;
}

export async function renderPasswordResetEmail(data: PasswordResetEmail): Promise<{ subject: string; text: string; html: string }> {
  const subject = "Password Reset Request";
  const url = escapeHtml(data.resetUrl);
  const text = `You requested a password reset. Click the link below to reset your password:\n\n${data.resetUrl}\n\nThis link will expire in ${data.expiresInMinutes} minutes.\n\nIf you did not request this, please ignore this email.`;
  const html = `<p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p><p>This link will expire in ${data.expiresInMinutes} minutes.</p><p>If you did not request this, please ignore this email.</p>`;
  return { subject, text, html };
}

export async function renderEmailVerificationEmail(data: EmailVerificationEmail): Promise<{ subject: string; text: string; html: string }> {
  const subject = "Verify Your Email Address";
  const hours = Math.floor(data.expiresInMinutes / 60);
  const url = escapeHtml(data.verificationUrl);
  const text = `Please verify your email address by clicking the link below:\n\n${data.verificationUrl}\n\nThis link will expire in ${hours} hours.\n\nIf you did not create an account, please ignore this email.`;
  const html = `<p>Please verify your email address by clicking the link below:</p><p><a href="${url}">${url}</a></p><p>This link will expire in ${hours} hours.</p><p>If you did not create an account, please ignore this email.</p>`;
  return { subject, text, html };
}

export async function renderRecruitingInvitationEmail(data: RecruitingInvitationEmail): Promise<{ subject: string; text: string; html: string }> {
  const name = escapeHtml(data.candidateName);
  const title = escapeHtml(data.assessmentTitle);
  const url = escapeHtml(data.accessUrl);
  const subject = `You're invited: ${data.assessmentTitle}`;
  const expiryNote = data.expiresAt
    ? `\n\nThis link expires on ${data.expiresAt.toISOString().split("T")[0]}.`
    : "";
  const text = `Hi ${data.candidateName},\n\nYou've been invited to a coding assessment: ${data.assessmentTitle}.\n\nClick the link below to begin:\n${data.accessUrl}${expiryNote}\n\nGood luck!`;
  const expiryHtml = data.expiresAt
    ? `<p>This link expires on <strong>${data.expiresAt.toISOString().split("T")[0]}</strong>.</p>`
    : "";
  const html = `<p>Hi ${name},</p><p>You've been invited to a coding assessment: <strong>${title}</strong>.</p><p><a href="${url}">Click here to begin</a></p>${expiryHtml}<p>Good luck!</p>`;
  return { subject, text, html };
}

export async function renderSiteEventEmail(data: SiteEventEmail): Promise<{ subject: string; text: string; html: string }> {
  const title = escapeHtml(data.title);
  const eventType = escapeHtml(data.eventType);
  const details = escapeHtml(data.details);
  const subject = `[${data.severity.toUpperCase()}] ${data.title}`;
  const text = `Event: ${data.eventType}\nTitle: ${data.title}\nSeverity: ${data.severity}\n\nDetails:\n${data.details}`;
  const html = `<h2>${title}</h2><p><strong>Event:</strong> ${eventType}</p><p><strong>Severity:</strong> ${data.severity}</p><hr/><p>${details}</p>`;
  return { subject, text, html };
}

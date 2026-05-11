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

export async function renderPasswordResetEmail(data: PasswordResetEmail): Promise<{ subject: string; text: string; html: string }> {
  const subject = "Password Reset Request";
  const text = `You requested a password reset. Click the link below to reset your password:\n\n${data.resetUrl}\n\nThis link will expire in ${data.expiresInMinutes} minutes.\n\nIf you did not request this, please ignore this email.`;
  const html = `<p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${data.resetUrl}">${data.resetUrl}</a></p><p>This link will expire in ${data.expiresInMinutes} minutes.</p><p>If you did not request this, please ignore this email.</p>`;
  return { subject, text, html };
}

export async function renderEmailVerificationEmail(data: EmailVerificationEmail): Promise<{ subject: string; text: string; html: string }> {
  const subject = "Verify Your Email Address";
  const hours = Math.floor(data.expiresInMinutes / 60);
  const text = `Please verify your email address by clicking the link below:\n\n${data.verificationUrl}\n\nThis link will expire in ${hours} hours.\n\nIf you did not create an account, please ignore this email.`;
  const html = `<p>Please verify your email address by clicking the link below:</p><p><a href="${data.verificationUrl}">${data.verificationUrl}</a></p><p>This link will expire in ${hours} hours.</p><p>If you did not create an account, please ignore this email.</p>`;
  return { subject, text, html };
}

export async function renderSiteEventEmail(data: SiteEventEmail): Promise<{ subject: string; text: string; html: string }> {
  const subject = `[${data.severity.toUpperCase()}] ${data.title}`;
  const text = `Event: ${data.eventType}\nTitle: ${data.title}\nSeverity: ${data.severity}\n\nDetails:\n${data.details}`;
  const html = `<h2>${data.title}</h2><p><strong>Event:</strong> ${data.eventType}</p><p><strong>Severity:</strong> ${data.severity}</p><hr/><p>${data.details}</p>`;
  return { subject, text, html };
}

import type { EmailProvider, EmailMessage, SendResult } from "./types";
import { logger } from "@/lib/logger";

export const sendgridProvider: EmailProvider = {
  name: "sendgrid",

  async isConfigured(): Promise<boolean> {
    return !!process.env.SENDGRID_API_KEY;
  },

  async send(message: EmailMessage): Promise<SendResult> {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return { success: false, error: "SendGrid API key not configured" };
    }

    const from = process.env.SENDGRID_FROM || process.env.SMTP_FROM || "noreply@judgekit.local";

    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: from },
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            ...(message.html ? [{ type: "text/html", value: message.html }] : []),
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "unknown");
        logger.error({ status: response.status, body }, "SendGrid send failed");
        return { success: false, error: `SendGrid HTTP ${response.status}: ${body}` };
      }

      const messageId = response.headers.get("x-message-id") || undefined;
      logger.info({ to: message.to, subject: message.subject, messageId }, "Email sent via SendGrid");
      return { success: true, messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ to: message.to, error: errMsg }, "SendGrid send failed");
      return { success: false, error: errMsg };
    }
  },
};

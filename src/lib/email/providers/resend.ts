import type { EmailProvider, EmailMessage, SendResult } from "./types";
import { logger } from "@/lib/logger";

export const resendProvider: EmailProvider = {
  name: "resend",

  async isConfigured(): Promise<boolean> {
    return !!process.env.RESEND_API_KEY;
  },

  async send(message: EmailMessage): Promise<SendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Resend API key not configured" };
    }

    const from = process.env.RESEND_FROM || process.env.SMTP_FROM || "noreply@judgekit.local";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });

      const data = await response.json().catch(() => ({}) as Record<string, unknown>);

      if (!response.ok) {
        const err = (data as { message?: string }).message || `HTTP ${response.status}`;
        logger.error({ status: response.status, error: err }, "Resend send failed");
        return { success: false, error: err };
      }

      const messageId = (data as { id?: string }).id;
      logger.info({ to: message.to, subject: message.subject, messageId }, "Email sent via Resend");
      return { success: true, messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ to: message.to, error: errMsg }, "Resend send failed");
      return { success: false, error: errMsg };
    }
  },
};

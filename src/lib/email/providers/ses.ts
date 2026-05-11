import type { EmailProvider, EmailMessage, SendResult } from "./types";
import { logger } from "@/lib/logger";

export const sesProvider: EmailProvider = {
  name: "ses",

  async isConfigured(): Promise<boolean> {
    return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION);
  },

  async send(message: EmailMessage): Promise<SendResult> {
    const region = process.env.AWS_REGION;
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!region || !accessKey || !secretKey) {
      return { success: false, error: "AWS SES credentials not configured" };
    }

    const from = process.env.SES_FROM || process.env.SMTP_FROM || "noreply@judgekit.local";

    try {
      // Build SigV4 signature for SESv2 SendEmail API
      const endpoint = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "");
      const dateStamp = amzDate.slice(0, 8);
      const payload = JSON.stringify({
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: message.text, Charset: "UTF-8" },
              ...(message.html ? { Html: { Data: message.html, Charset: "UTF-8" } } : {}),
            },
          },
        },
        Destination: { ToAddresses: [message.to] },
        FromEmailAddress: from,
      });

      const crypto = await import("crypto");
      const hmac = (key: string | Buffer, msg: string) => crypto.createHmac("sha256", key).update(msg).digest();
      const hash = (msg: string) => crypto.createHash("sha256").update(msg).digest("hex");

      const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
      const signedHeaders = "host;x-amz-date";
      const canonicalRequest = `POST\n/v2/email/outbound-emails\n\nhost:email.${region}.amazonaws.com\nx-amz-date:${amzDate}\n\n${signedHeaders}\n${hash(payload)}`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hash(canonicalRequest)}`;
      const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), "ses"), "aws4_request");
      const signature = hmac(signingKey, stringToSign).toString("hex");

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Amz-Date": amzDate,
          Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        body: payload,
      });

      const data = await response.json().catch(() => ({}) as Record<string, unknown>);

      if (!response.ok) {
        const err = (data as { Message?: string }).Message || `HTTP ${response.status}`;
        logger.error({ status: response.status, error: err }, "SES send failed");
        return { success: false, error: err };
      }

      const messageId = (data as { MessageId?: string }).MessageId;
      logger.info({ to: message.to, subject: message.subject, messageId }, "Email sent via SES");
      return { success: true, messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ to: message.to, error: errMsg }, "SES send failed");
      return { success: false, error: errMsg };
    }
  },
};

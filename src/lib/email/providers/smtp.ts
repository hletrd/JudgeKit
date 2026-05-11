import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { EmailProvider, EmailMessage, SendResult } from "./types";
import { getSystemSettings } from "@/lib/system-settings";
import { decrypt } from "@/lib/security/encryption";
import { logger } from "@/lib/logger";

let transporter: Transporter | null = null;
let lastConfigHash = "";

function hashConfig(config: Record<string, unknown>): string {
  return JSON.stringify(config);
}

async function getSmtpConfig(): Promise<{
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string | null;
}> {
  const envHost = process.env.SMTP_HOST;
  const envPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const envSecure = process.env.SMTP_SECURE === "true";
  const envUser = process.env.SMTP_USER;
  const envPass = process.env.SMTP_PASS;
  const envFrom = process.env.SMTP_FROM;

  if (envHost && envPort && envUser && envPass) {
    return {
      host: envHost,
      port: envPort,
      secure: envSecure,
      user: envUser,
      pass: envPass,
      from: envFrom || envUser,
    };
  }

  const settings = await getSystemSettings();
  if (!settings) {
    return { host: null, port: null, secure: false, user: null, pass: null, from: null };
  }

  const raw = settings as Record<string, unknown>;
  const pass = raw.smtpPass ? decrypt(raw.smtpPass as string) : null;

  return {
    host: (raw.smtpHost as string | null) || null,
    port: raw.smtpPort != null ? Number(raw.smtpPort) : null,
    secure: Boolean(raw.smtpSecure),
    user: (raw.smtpUser as string | null) || null,
    pass,
    from: (raw.smtpFrom as string | null) || null,
  };
}

export const smtpProvider: EmailProvider = {
  name: "smtp",

  async isConfigured(): Promise<boolean> {
    const config = await getSmtpConfig();
    return !!(config.host && config.port && config.user && config.pass && config.from);
  },

  async send(message: EmailMessage): Promise<SendResult> {
    const config = await getSmtpConfig();

    if (!config.host || !config.port || !config.user || !config.pass) {
      return { success: false, error: "SMTP not configured" };
    }

    const cfgHash = hashConfig(config);
    if (!transporter || lastConfigHash !== cfgHash) {
      transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
        tls: { rejectUnauthorized: !process.env.SMTP_SKIP_TLS_VERIFY },
      });
      lastConfigHash = cfgHash;
    }

    const from = config.from || config.user;

    try {
      const result = await transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      logger.info({ to: message.to, subject: message.subject, messageId: result.messageId }, "Email sent via SMTP");
      return { success: true, messageId: result.messageId };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ to: message.to, subject: message.subject, error: errMsg }, "SMTP send failed");
      return { success: false, error: errMsg };
    }
  },
};

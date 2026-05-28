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
  // Read the stored SMTP password with the plaintext-migration fallback enabled,
  // mirroring the sibling secret reader in src/lib/security/hcaptcha.ts. Without
  // this, a legacy plaintext smtpPass (configured before column encryption, or
  // restored from an older backup) makes decrypt() throw in production, which
  // propagates out of isConfigured()/send() and silently disables ALL
  // transactional email. The encryption module still emits a production warn-log
  // on plaintext input, preserving the migration audit trail.
  const pass = raw.smtpPass ? decrypt(raw.smtpPass as string, { allowPlaintextFallback: true }) : null;

  return {
    host: (raw.smtpHost as string | null) || null,
    port: raw.smtpPort != null ? Number(raw.smtpPort) : null,
    secure: Boolean(raw.smtpSecure),
    user: (raw.smtpUser as string | null) || null,
    pass,
    from: (raw.smtpFrom as string | null) || null,
  };
}

function buildTransporter(config: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}): Transporter {
  // `secure: true` = implicit TLS on connect (port 465).
  // `secure: false` = plain connection that auto-upgrades via STARTTLS
  // if the server advertises it (which port 587 servers always do).
  // Nodemailer handles the STARTTLS negotiation automatically when
  // secure=false — no explicit "starttls" flag is needed.
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: !process.env.SMTP_SKIP_TLS_VERIFY },
  });
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
      transporter = buildTransporter({
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        pass: config.pass,
      });
      lastConfigHash = cfgHash;
    }

    const from = config.from || config.user;

    // Retry once on transient failures (network reset, temporary SMTP 4xx).
    for (let attempt = 1; attempt <= 2; attempt++) {
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
        const code = (error as { code?: string })?.code;
        const isTransient =
          code === "ECONNRESET" ||
          code === "ETIMEDOUT" ||
          code === "ECONNREFUSED" ||
          code === "ESOCKET" ||
          errMsg.includes("421 ") ||
          errMsg.includes("try again");

        if (isTransient && attempt < 2) {
          logger.warn({ to: message.to, error: errMsg, attempt }, "SMTP transient failure, retrying");
          transporter = buildTransporter({
            host: config.host,
            port: config.port,
            secure: config.secure,
            user: config.user,
            pass: config.pass,
          });
          lastConfigHash = cfgHash;
          continue;
        }

        logger.error({ to: message.to, subject: message.subject, error: errMsg }, "SMTP send failed");
        return { success: false, error: errMsg };
      }
    }

    return { success: false, error: "SMTP send exhausted retries" };
  },
};

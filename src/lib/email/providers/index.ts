import type { EmailProvider, EmailMessage, SendResult } from "./types";
import { smtpProvider } from "./smtp";
import { sendgridProvider } from "./sendgrid";
import { resendProvider } from "./resend";
import { sesProvider } from "./ses";
import { logger } from "@/lib/logger";

const providers: EmailProvider[] = [
  sendgridProvider,
  resendProvider,
  sesProvider,
  smtpProvider, // fallback last
];

let activeProvider: EmailProvider | null = null;

async function detectProvider(): Promise<EmailProvider | null> {
  for (const provider of providers) {
    // Defense-in-depth: a provider's isConfigured() should never throw, but if
    // one does (e.g. a decrypt failure on a malformed stored secret), treat it
    // as "not configured" and continue rather than letting the exception escape
    // detectProvider() and disable all email. Failures are logged.
    try {
      if (await provider.isConfigured()) {
        return provider;
      }
    } catch (error) {
      logger.warn(
        { provider: provider.name, error: error instanceof Error ? error.message : String(error) },
        "Email provider isConfigured() threw; treating provider as not configured"
      );
    }
  }
  return null;
}

export async function isEmailConfigured(): Promise<boolean> {
  const provider = await detectProvider();
  return provider !== null;
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!activeProvider || !(await activeProvider.isConfigured())) {
    activeProvider = await detectProvider();
  }

  if (!activeProvider) {
    return { success: false, error: "No email provider configured" };
  }

  return activeProvider.send(message);
}

export function getActiveProviderName(): string | null {
  return activeProvider?.name ?? null;
}

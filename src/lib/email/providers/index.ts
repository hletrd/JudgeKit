import type { EmailProvider, EmailMessage, SendResult } from "./types";
import { smtpProvider } from "./smtp";
import { sendgridProvider } from "./sendgrid";
import { resendProvider } from "./resend";
import { sesProvider } from "./ses";

const providers: EmailProvider[] = [
  sendgridProvider,
  resendProvider,
  sesProvider,
  smtpProvider, // fallback last
];

let activeProvider: EmailProvider | null = null;

async function detectProvider(): Promise<EmailProvider | null> {
  for (const provider of providers) {
    if (await provider.isConfigured()) {
      return provider;
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

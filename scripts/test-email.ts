/**
 * CLI script to test email provider configuration.
 *
 * Usage:
 *   npx tsx scripts/test-email.ts <recipient-email>
 *
 * Examples:
 *   npx tsx scripts/test-email.ts admin@example.com
 *   npx tsx scripts/test-email.ts user@gmail.com
 */

import { sendEmail, isEmailConfigured } from "../src/lib/email/providers";
import { getActiveProviderName } from "../src/lib/email/providers";

async function main() {
  const to = process.argv[2];

  if (!to) {
    console.error("Usage: npx tsx scripts/test-email.ts <recipient-email>");
    process.exit(1);
  }

  console.log(`Checking email configuration...`);
  const configured = await isEmailConfigured();

  if (!configured) {
    console.error("No email provider is configured.");
    console.error("Set one of the following environment variables:");
    console.error("  - SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASS");
    console.error("  - SENDGRID_API_KEY");
    console.error("  - RESEND_API_KEY");
    console.error("  - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION");
    process.exit(1);
  }

  console.log(`Provider: ${getActiveProviderName()}`);
  console.log(`Sending test email to ${to}...`);

  const result = await sendEmail({
    to,
    subject: "JudgeKit Email Test",
    text: "This is a test email from JudgeKit. If you received this, your email configuration is working correctly.",
    html: "<p>This is a test email from JudgeKit.</p><p>If you received this, your email configuration is working correctly.</p>",
  });

  if (result.success) {
    console.log("Test email sent successfully!");
    console.log(`Message ID: ${result.messageId ?? "N/A"}`);
  } else {
    console.error(`Failed to send test email: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

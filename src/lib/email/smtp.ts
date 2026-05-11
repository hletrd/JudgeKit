/**
 * Backward-compatible re-export of the provider-based email system.
 * New code should import from `@/lib/email/providers` directly.
 */

export { sendEmail, isEmailConfigured } from "./providers";
export type { EmailMessage } from "./providers/types";

export const SUBMISSION_ID_LENGTH = 32;

/**
 * Number of hex characters shown to users when displaying a submission ID
 * in abbreviated form (e.g., in listings and toast notifications).
 *
 * 12 characters represent 6 bytes (48 bits) of the 32-byte (64 hex char) ID,
 * which gives ~281 trillion possible prefixes — sufficient to be visually
 * distinctive while remaining short enough to display inline.
 */
export const SUBMISSION_ID_VISIBLE_PREFIX_LENGTH = 12;

export function generateSubmissionId(): string {
  const bytes = new Uint8Array(SUBMISSION_ID_LENGTH / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatSubmissionIdPrefix(id: string): string {
  return id.slice(0, SUBMISSION_ID_VISIBLE_PREFIX_LENGTH);
}

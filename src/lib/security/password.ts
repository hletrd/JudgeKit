// Bumped from 8 → 12 per security review L-1.
//   - On a typical recruiting / contest deployment usernames leak via
//     leaderboards and audit logs, so brute-force-on-leaked-username is a
//     real attack. The 4-character bump shrinks the search space by 62^4
//     (~14 million ×) without trapping users in complexity rules.
//   - Operators that need an 8-char floor for legacy compatibility can
//     override via system_settings.min_password_length (4..128). The
//     validator at src/lib/validators/system-settings.ts caps that range.
//   - AGENTS.md previously pinned this at 8; the bump is the explicit
//     approval called out in that note.
export const FIXED_MIN_PASSWORD_LENGTH = 12;

export type PasswordValidationError = "passwordTooShort";

/**
 * Validate password against the minimum-length-only policy documented in
 * AGENTS.md. No complexity rules — they hurt UX without meaningfully
 * raising the bar against modern offline attacks (which are bounded by
 * Argon2id work factor, not by character classes).
 */
export function getPasswordValidationError(
  password: string,
): PasswordValidationError | null {
  if (password.length < FIXED_MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }

  return null;
}

export function isStrongPassword(password: string) {
  return getPasswordValidationError(password) === null;
}

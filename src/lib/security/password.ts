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

export type PasswordValidationError =
  | "passwordTooShort"
  | "passwordContainsUsername"
  | "passwordContainsEmail";

/**
 * Identity context used to reject passwords that embed the account's own
 * username or email. Both fields are optional; absent fields are skipped, so
 * callers without identity context still get the length check.
 */
export interface PasswordValidationContext {
  username?: string | null;
  email?: string | null;
}

// Below this length an identity fragment is too short/common to meaningfully
// flag (e.g. a 2-char username appearing incidentally inside a passphrase).
const MIN_IDENTITY_FRAGMENT_LENGTH = 3;

/**
 * Validate password against the policy: a minimum-length rule plus a check
 * that the password does not contain the account's own username or email.
 * No complexity classes and no common-password blocklist — those hurt UX
 * without meaningfully raising the bar against modern offline attacks (which
 * are bounded by Argon2id work factor). Blocking the user's own identity,
 * however, defeats the most common trivially-guessable passwords.
 */
export function getPasswordValidationError(
  password: string,
  context?: PasswordValidationContext,
): PasswordValidationError | null {
  if (password.length < FIXED_MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }

  const lowerPassword = password.toLowerCase();

  const username = context?.username?.trim().toLowerCase();
  if (
    username &&
    username.length >= MIN_IDENTITY_FRAGMENT_LENGTH &&
    lowerPassword.includes(username)
  ) {
    return "passwordContainsUsername";
  }

  const email = context?.email?.trim().toLowerCase();
  if (email) {
    const localPart = email.split("@")[0] ?? "";
    if (
      lowerPassword.includes(email) ||
      (localPart.length >= MIN_IDENTITY_FRAGMENT_LENGTH && lowerPassword.includes(localPart))
    ) {
      return "passwordContainsEmail";
    }
  }

  return null;
}

export function isStrongPassword(password: string, context?: PasswordValidationContext) {
  return getPasswordValidationError(password, context) === null;
}

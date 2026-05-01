export const FIXED_MIN_PASSWORD_LENGTH = 8;

export type PasswordValidationError = "passwordTooShort";

/**
 * Validate password against the minimum-length-only policy documented in AGENTS.md:
 * "Password validation MUST only check minimum length — exactly 8 characters
 * minimum, no other rules."
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

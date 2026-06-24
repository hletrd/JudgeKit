export const FIXED_MIN_PASSWORD_LENGTH = 8;

export type PasswordValidationError = "passwordTooShort";

/**
 * Identity context is accepted for call-site compatibility. The repository
 * password policy intentionally remains length-only.
 */
export interface PasswordValidationContext {
  username?: string | null;
  email?: string | null;
}

/**
 * Validate password against the project policy: exactly an 8-character minimum.
 * Do not add complexity, dictionary, or identity-similarity rules without
 * explicit approval in AGENTS.md.
 */
export function getPasswordValidationError(
  password: string,
  _context?: PasswordValidationContext,
): PasswordValidationError | null {
  if (password.length < FIXED_MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }
  return null;
}

export function isStrongPassword(password: string, context?: PasswordValidationContext) {
  return getPasswordValidationError(password, context) === null;
}

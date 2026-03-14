import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";

export type PasswordValidationError = "passwordTooShort" | "passwordTooLong";

export function getPasswordValidationError(
  password: string,
  _context?: { username?: string; email?: string | null }
): PasswordValidationError | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }

  if (password.length > 128) {
    return "passwordTooLong";
  }

  return null;
}

export function isStrongPassword(password: string, context?: { username?: string; email?: string | null }) {
  return getPasswordValidationError(password, context) === null;
}

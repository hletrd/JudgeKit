import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";

const HAS_UPPERCASE_LETTER = /[A-Z]/;
const HAS_LOWERCASE_LETTER = /[a-z]/;
const HAS_NUMBER = /\d/;

export type PasswordValidationError = "passwordTooShort" | "passwordTooWeak";

export function getPasswordValidationError(password: string): PasswordValidationError | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }

  if (
    !HAS_UPPERCASE_LETTER.test(password) ||
    !HAS_LOWERCASE_LETTER.test(password) ||
    !HAS_NUMBER.test(password)
  ) {
    return "passwordTooWeak";
  }

  return null;
}

export function isStrongPassword(password: string) {
  return getPasswordValidationError(password) === null;
}

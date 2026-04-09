import { getMinPasswordLength } from "@/lib/security/constants";

export type PasswordValidationError = "passwordTooShort" | "passwordTooLong" | "passwordTooSimilar";

export function getPasswordValidationError(
  password: string,
  context?: { username?: string; email?: string | null }
): PasswordValidationError | null {
  if (password.length < getMinPasswordLength()) {
    return "passwordTooShort";
  }

  if (password.length > 128) {
    return "passwordTooLong";
  }

  // Check password is not too similar to username or email
  if (context) {
    const lower = password.toLowerCase();
    const MIN_SIMILARITY_LEN = 4;
    if (context.username && context.username.length >= MIN_SIMILARITY_LEN) {
      const lowerUsername = context.username.toLowerCase();
      if (lower.includes(lowerUsername) || lowerUsername.includes(lower)) {
        return "passwordTooSimilar";
      }
    }
    if (context.email) {
      const emailLocal = context.email.toLowerCase().split("@")[0];
      if (emailLocal && emailLocal.length >= MIN_SIMILARITY_LEN) {
        if (lower.includes(emailLocal) || emailLocal.includes(lower)) {
          return "passwordTooSimilar";
        }
      }
    }
  }

  return null;
}

export function isStrongPassword(password: string, context?: { username?: string; email?: string | null }) {
  return getPasswordValidationError(password, context) === null;
}

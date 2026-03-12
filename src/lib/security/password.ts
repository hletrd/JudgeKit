import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";

const HAS_UPPERCASE_LETTER = /[A-Z]/;
const HAS_LOWERCASE_LETTER = /[a-z]/;
const HAS_NUMBER = /\d/;

const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
  "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
  "ashley", "michael", "shadow", "123123", "654321", "superman", "qazwsx",
  "football", "password1", "password123", "batman", "login",
  "admin123", "welcome", "hello123", "charlie", "donald", "princess",
  "qwerty123", "1q2w3e4r", "master123", "1234567890", "12345", "123456789",
  "1234", "111111", "000000", "121212", "696969", "passw0rd",
  "access", "flower", "hottie", "loveme", "zaq1zaq1", "666666",
  "123321", "1qaz2wsx", "test123", "qwer1234", "abcd1234",
  "asdf1234", "zxcv1234", "1q2w3e", "q1w2e3r4", "pass1234",
  "changeme", "welcome1", "user1234", "temp1234", "guest123",
  "admin1234", "root1234", "test1234", "demo1234", "pass123",
  "letmein1", "sunshine1", "princess1", "football1", "baseball1",
  "dragon1", "monkey1", "shadow1", "master1", "qwerty1",
  "abc1234", "password2", "iloveu", "trustno", "1password",
  "p@ssw0rd", "p@ssword", "passw0rd1", "hunter2", "starwars",
  "whatever", "freedom", "mustang", "summer", "jennifer", "jordan",
  "harley", "ranger", "thomas", "robert", "soccer", "hockey",
  "killer", "george", "andrew", "andrea", "joshua", "student",
]);

export type PasswordValidationError = "passwordTooShort" | "passwordTooLong" | "passwordTooWeak" | "passwordTooCommon" | "passwordTooContextual";

/**
 * Returns true if the password contains the username or the local part of the
 * email address (case-insensitive). Used to prevent context-aware weak passwords
 * such as "Alice123!" when the username is "alice".
 */
export function isPasswordContextual(
  password: string,
  username: string,
  email?: string | null
): boolean {
  const lower = password.toLowerCase();

  if (username && lower.includes(username.toLowerCase())) {
    return true;
  }

  if (email) {
    const emailPrefix = email.split("@")[0];
    if (emailPrefix && lower.includes(emailPrefix.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function getPasswordValidationError(
  password: string,
  context?: { username?: string; email?: string | null }
): PasswordValidationError | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "passwordTooShort";
  }

  if (password.length > 128) {
    return "passwordTooLong";
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "passwordTooCommon";
  }

  if (
    !HAS_UPPERCASE_LETTER.test(password) ||
    !HAS_LOWERCASE_LETTER.test(password) ||
    !HAS_NUMBER.test(password)
  ) {
    return "passwordTooWeak";
  }

  if (context?.username && isPasswordContextual(password, context.username, context.email)) {
    return "passwordTooContextual";
  }

  return null;
}

export function isStrongPassword(password: string, context?: { username?: string; email?: string | null }) {
  return getPasswordValidationError(password, context) === null;
}

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({
    minPasswordLength: 12,
  }),
}));
import {
  getPasswordValidationError,
  isStrongPassword,
  FIXED_MIN_PASSWORD_LENGTH,
} from "@/lib/security/password";

describe("getPasswordValidationError", () => {
  // --- Length boundary tests ---

  it("rejects empty password as too short", () => {
    expect(getPasswordValidationError("")).toBe("passwordTooShort");
  });

  it("rejects password shorter than minimum length (11 chars)", () => {
    expect(getPasswordValidationError("Abc123!xyz9")).toBe("passwordTooShort");
  });

  it("rejects the previously-minimum 8 char example after the SEC L-1 bump", () => {
    expect(getPasswordValidationError("Kj7xMq9z")).toBe("passwordTooShort");
  });

  it("accepts password at exactly the minimum length (12 chars)", () => {
    expect(getPasswordValidationError("Kj7xMq9zN2pA")).toBeNull();
  });

  it("accepts a strong password well above the minimum", () => {
    expect(getPasswordValidationError("Kj7xMq9zN2pAqR")).toBeNull();
  });

  it("accepts password with only lowercase letters", () => {
    expect(getPasswordValidationError("zlxkwmqjabcd")).toBeNull();
  });

  it("accepts password with only digits", () => {
    expect(getPasswordValidationError("998877665544")).toBeNull();
  });

  it("accepts 'passwordword' (common words are allowed per policy)", () => {
    expect(getPasswordValidationError("passwordword")).toBeNull();
  });

  it("accepts '123456789012' (sequential digits are allowed per policy)", () => {
    expect(getPasswordValidationError("123456789012")).toBeNull();
  });

  it("exports FIXED_MIN_PASSWORD_LENGTH as 12 (SEC L-1)", () => {
    expect(FIXED_MIN_PASSWORD_LENGTH).toBe(12);
  });
});

describe("isStrongPassword", () => {
  it("returns true for a valid password (>=12 chars)", () => {
    expect(isStrongPassword("Kj7xMq9zN2pA")).toBe(true);
  });

  it("returns false for a password under 12 chars", () => {
    expect(isStrongPassword("Abc123abc")).toBe(false);
  });

  it("returns false when the password contains the username", () => {
    expect(isStrongPassword("xxmyusernamexx99", { username: "myusername" })).toBe(false);
  });
});

describe("getPasswordValidationError identity rules", () => {
  it("rejects a password that contains the username (case-insensitive)", () => {
    expect(
      getPasswordValidationError("XXMyUserNameXX99", { username: "myusername" })
    ).toBe("passwordContainsUsername");
  });

  it("rejects a password equal to the username", () => {
    expect(
      getPasswordValidationError("longusername12", { username: "longusername12" })
    ).toBe("passwordContainsUsername");
  });

  it("rejects a password that contains the email local-part", () => {
    expect(
      getPasswordValidationError("alicewonder-pw1", { email: "alice@example.com" })
    ).toBe("passwordContainsEmail");
  });

  it("rejects a password that contains the full email address", () => {
    expect(
      getPasswordValidationError("x-alice@example.com-y", { email: "alice@example.com" })
    ).toBe("passwordContainsEmail");
  });

  it("ignores an identity fragment shorter than 3 chars", () => {
    expect(getPasswordValidationError("abxyzqwerty12", { username: "ab" })).toBeNull();
  });

  it("accepts a valid password that does not embed the identity", () => {
    expect(
      getPasswordValidationError("Kj7xMq9zN2pA", {
        username: "alice",
        email: "alice@example.com",
      })
    ).toBeNull();
  });

  it("applies the length check before the identity check", () => {
    expect(getPasswordValidationError("alice", { username: "alice" })).toBe(
      "passwordTooShort"
    );
  });

  it("falls back to length-only validation when no context is given", () => {
    expect(getPasswordValidationError("zlxkwmqjabcd")).toBeNull();
  });
});

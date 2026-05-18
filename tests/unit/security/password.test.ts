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
});

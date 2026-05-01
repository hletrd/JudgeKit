import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({
    minPasswordLength: 8,
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

  it("rejects password shorter than minimum length (7 chars)", () => {
    expect(getPasswordValidationError("Abc123!")).toBe("passwordTooShort");
  });

  it("rejects the classic short example Abc123 (6 chars)", () => {
    expect(getPasswordValidationError("Abc123")).toBe("passwordTooShort");
  });

  it("accepts password at exactly the minimum length (8 chars)", () => {
    expect(getPasswordValidationError("Kj7xMq9z")).toBeNull();
  });

  it("accepts a strong password well above the minimum", () => {
    expect(getPasswordValidationError("Kj7xMq9zN2")).toBeNull();
  });

  it("accepts password with only lowercase letters", () => {
    expect(getPasswordValidationError("zlxkwmqj")).toBeNull();
  });

  it("accepts password with only digits", () => {
    expect(getPasswordValidationError("99887766")).toBeNull();
  });

  it("accepts 'password' (common words are allowed per policy)", () => {
    expect(getPasswordValidationError("password")).toBeNull();
  });

  it("accepts '12345678' (sequential digits are allowed per policy)", () => {
    expect(getPasswordValidationError("12345678")).toBeNull();
  });

  it("exports FIXED_MIN_PASSWORD_LENGTH as 8", () => {
    expect(FIXED_MIN_PASSWORD_LENGTH).toBe(8);
  });
});

describe("isStrongPassword", () => {
  it("returns true for a valid password", () => {
    expect(isStrongPassword("Kj7xMq9zN2")).toBe(true);
  });

  it("returns false for a short password", () => {
    expect(isStrongPassword("Abc123")).toBe(false);
  });
});

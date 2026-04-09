import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/system-settings-config", () => ({
  getConfiguredSettings: () => ({
    minPasswordLength: 8,
  }),
}));
import {
  getPasswordValidationError,
  isStrongPassword,
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
    expect(isStrongPassword("Kj7xMq9zN2")).toBe(true);
  });

  it("accepts password at exactly the maximum length (128 chars)", () => {
    const maxPass = "x".repeat(128);
    expect(maxPass.length).toBe(128);
    expect(getPasswordValidationError(maxPass)).toBeNull();
  });

  it("rejects password that is one character over the maximum (129 chars)", () => {
    const tooLong = "x".repeat(129);
    expect(tooLong.length).toBe(129);
    expect(getPasswordValidationError(tooLong)).toBe("passwordTooLong");
  });

  it("rejects a very long password (200 chars)", () => {
    const veryLong = "x".repeat(200);
    expect(getPasswordValidationError(veryLong)).toBe("passwordTooLong");
  });

  it("accepts password with only lowercase letters", () => {
    expect(getPasswordValidationError("abcdefgh")).toBeNull();
  });

  it("accepts password with only digits", () => {
    expect(getPasswordValidationError("99887766")).toBeNull();
  });

  it("accepts a common password (no common password check)", () => {
    expect(getPasswordValidationError("password")).toBeNull();
  });

  it("rejects password containing username when context is provided", () => {
    expect(
      getPasswordValidationError("Alice123", { username: "alice" })
    ).toBe("passwordTooSimilar");
  });

  // --- H-02: Bidirectional similarity check tests ---

  it("rejects password when username contains password (reverse direction)", () => {
    expect(
      getPasswordValidationError("mypassword123", { username: "longusernamecontainingsomething" })
    ).toBeNull();
    expect(
      getPasswordValidationError("mysupersecretpassword", { username: "secret" })
    ).toBe("passwordTooSimilar");
  });

  it("rejects password when email local part contains password (reverse direction)", () => {
    expect(
      getPasswordValidationError("mypassword123", { email: "user@example.com" })
    ).toBeNull();
    expect(
      getPasswordValidationError("mysupersecretpassword", { email: "secret@example.com" })
    ).toBe("passwordTooSimilar");
  });

  it("does NOT trigger similarity check for short username (< 4 chars)", () => {
    expect(
      getPasswordValidationError("abc12345", { username: "bob" })
    ).toBeNull();
    expect(
      getPasswordValidationError("xyz78901", { username: "sam" })
    ).toBeNull();
    // Short username should NOT fail even if password contains it
    expect(
      getPasswordValidationError("bobpass123", { username: "bob" })
    ).toBeNull();
  });

  it("does NOT trigger similarity check for short email local part (< 4 chars)", () => {
    expect(
      getPasswordValidationError("abc12345", { email: "bob@example.com" })
    ).toBeNull();
    expect(
      getPasswordValidationError("xyz78901", { email: "sam@company.org" })
    ).toBeNull();
    // Short email local part should NOT fail even if password contains it
    expect(
      getPasswordValidationError("bobpass123", { email: "bob@example.com" })
    ).toBeNull();
  });
});

describe("isStrongPassword", () => {
  it("returns true for a valid password", () => {
    expect(isStrongPassword("Kj7xMq9zN2")).toBe(true);
  });

  it("returns false for a short password", () => {
    expect(isStrongPassword("Abc123")).toBe(false);
  });

  it("returns true for a simple password that meets length requirement", () => {
    expect(isStrongPassword("password")).toBe(true);
  });
});

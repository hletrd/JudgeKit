import { describe, expect, it } from "vitest";
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

  it("accepts password containing username (no contextual check)", () => {
    expect(
      getPasswordValidationError("Alice123", { username: "alice" })
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

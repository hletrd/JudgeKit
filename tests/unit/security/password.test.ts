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

  it("rejects password shorter than minimum length", () => {
    expect(getPasswordValidationError("Kj7xMq9")).toBe("passwordTooShort");
  });

  it("accepts password at exactly the minimum length (8 chars)", () => {
    expect(getPasswordValidationError("Kj7xMq9z")).toBeNull();
  });

  it("accepts a longer password", () => {
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

  it("exports FIXED_MIN_PASSWORD_LENGTH as 8 per AGENTS.md", () => {
    expect(FIXED_MIN_PASSWORD_LENGTH).toBe(8);
  });
});

describe("isStrongPassword", () => {
  it("returns true for a valid password (>=8 chars)", () => {
    expect(isStrongPassword("Kj7xMq9z")).toBe(true);
  });

  it("returns false for a password under 8 chars", () => {
    expect(isStrongPassword("Abc123")).toBe(false);
  });
});

describe("getPasswordValidationError context compatibility", () => {
  it("keeps validation length-only even when identity context is passed", () => {
    expect(
      getPasswordValidationError("myusername", {
        username: "alice",
        email: "alice@example.com",
      })
    ).toBeNull();
  });

  it("still applies the length check when context is passed", () => {
    expect(getPasswordValidationError("alice", { username: "alice" })).toBe(
      "passwordTooShort"
    );
  });
});

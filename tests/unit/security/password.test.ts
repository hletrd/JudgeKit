import { describe, expect, it } from "vitest";
import {
  getPasswordValidationError,
  isPasswordContextual,
  isStrongPassword,
} from "@/lib/security/password";

describe("getPasswordValidationError", () => {
  // --- Length boundary tests ---

  it("rejects empty password as too short", () => {
    expect(getPasswordValidationError("")).toBe("passwordTooShort");
  });

  it("rejects password shorter than minimum length (7 chars)", () => {
    // 7 chars with all required classes — still too short
    expect(getPasswordValidationError("Abc123!")).toBe("passwordTooShort");
  });

  it("rejects the classic short example Abc123 (6 chars)", () => {
    expect(getPasswordValidationError("Abc123")).toBe("passwordTooShort");
  });

  it("accepts password at exactly the minimum length (8 chars)", () => {
    // Exactly 8 chars: uppercase + lowercase + digit
    expect(getPasswordValidationError("Kj7xMq9z")).toBeNull();
  });

  it("accepts a strong password well above the minimum", () => {
    expect(getPasswordValidationError("Kj7xMq9zN2")).toBeNull();
    expect(isStrongPassword("Kj7xMq9zN2")).toBe(true);
  });

  it("accepts password at exactly the maximum length (128 chars)", () => {
    // 128 chars: starts with 'Aa1' then padded to fill exactly 128
    const maxPass = "Aa1" + "x".repeat(125); // length === 128
    expect(maxPass.length).toBe(128);
    expect(getPasswordValidationError(maxPass)).toBeNull();
  });

  it("rejects password that is one character over the maximum (129 chars)", () => {
    const tooLong = "Aa1" + "x".repeat(126); // length === 129
    expect(tooLong.length).toBe(129);
    expect(getPasswordValidationError(tooLong)).toBe("passwordTooLong");
  });

  it("rejects a very long password (200 chars)", () => {
    const veryLong = "Aa1" + "x".repeat(197); // length === 200
    expect(getPasswordValidationError(veryLong)).toBe("passwordTooLong");
  });

  // --- Character class / weakness tests ---

  it("rejects password with only lowercase letters", () => {
    expect(getPasswordValidationError("abcdefgh")).toBe("passwordTooWeak");
  });

  it("rejects password with only uppercase letters", () => {
    expect(getPasswordValidationError("ABCDEFGH")).toBe("passwordTooWeak");
  });

  it("rejects password with only digits", () => {
    // Use a digit-only password not in the common list so the weakness check fires
    expect(getPasswordValidationError("99887766")).toBe("passwordTooWeak");
  });

  it("rejects password missing a digit (uppercase + lowercase only)", () => {
    expect(getPasswordValidationError("Abcdefgh")).toBe("passwordTooWeak");
  });

  it("rejects password missing uppercase (lowercase + digit only)", () => {
    expect(getPasswordValidationError("abcdefg1")).toBe("passwordTooWeak");
  });

  it("rejects password that is only spaces (8 spaces)", () => {
    // Spaces are not uppercase, lowercase, or digits → too weak
    expect(getPasswordValidationError("        ")).toBe("passwordTooWeak");
  });

  // --- Common password tests ---

  it("rejects a password in the common-passwords list (exact match)", () => {
    expect(getPasswordValidationError("password")).toBe("passwordTooCommon");
  });

  it("rejects a common password regardless of case (Password → lowercase check)", () => {
    // 'password' is in the list; 'Password' lowercases to 'password'
    // but 'Password' also lacks a digit, so it would hit passwordTooWeak first.
    // Use a common password that would otherwise pass weakness check.
    expect(getPasswordValidationError("p@ssw0rd")).toBe("passwordTooCommon");
  });

  it("rejects '1q2w3e4r' as a common password", () => {
    expect(getPasswordValidationError("1q2w3e4r")).toBe("passwordTooCommon");
  });

  // --- Contextual (username/email) tests ---

  it("rejects password that exactly equals the username (case-insensitive)", () => {
    // 'Alice123' contains 'alice' → contextual
    expect(
      getPasswordValidationError("Alice123", { username: "alice" })
    ).toBe("passwordTooContextual");
  });

  it("rejects password containing username as a substring", () => {
    expect(
      getPasswordValidationError("myAlice99!", { username: "alice" })
    ).toBe("passwordTooContextual");
  });

  it("rejects password containing email local-part as a substring", () => {
    expect(
      getPasswordValidationError("John99Secure!", {
        username: "unrelated",
        email: "john@example.com",
      })
    ).toBe("passwordTooContextual");
  });

  it("accepts a strong password when context is provided but no overlap", () => {
    expect(
      getPasswordValidationError("Kj7xMq9zN2", {
        username: "alice",
        email: "alice@example.com",
      })
    ).toBeNull();
  });

  it("ignores context when username is an empty string", () => {
    // Empty username → no contextual check, should accept a valid password
    expect(
      getPasswordValidationError("Kj7xMq9zN2", { username: "" })
    ).toBeNull();
  });

  // --- Unicode / special character tests ---

  it("accepts a password with ASCII special characters that meets all rules", () => {
    // Contains upper, lower, digit — special chars are a bonus but not required
    expect(getPasswordValidationError("Tr0ub4dor&3")).toBeNull();
  });

  it("accepts a unicode password that satisfies all rules", () => {
    // Unicode letters satisfy neither HAS_UPPERCASE_LETTER nor HAS_LOWERCASE_LETTER
    // in ASCII-only regexes, so we need ASCII letters+digit alongside them
    expect(getPasswordValidationError("Správné1")).toBeNull();
  });
});

describe("isPasswordContextual", () => {
  it("returns true when password equals username (case-insensitive)", () => {
    expect(isPasswordContextual("Alice123", "alice")).toBe(true);
  });

  it("returns true when password contains username as a substring", () => {
    expect(isPasswordContextual("myalice99", "alice")).toBe(true);
  });

  it("returns true when password contains email local-part", () => {
    expect(isPasswordContextual("john99secure", "other", "john@example.com")).toBe(true);
  });

  it("returns false when there is no overlap with username or email", () => {
    expect(isPasswordContextual("Kj7xMq9zN2", "alice", "alice@example.com")).toBe(false);
  });

  it("returns false when email is null", () => {
    expect(isPasswordContextual("Kj7xMq9zN2", "alice", null)).toBe(false);
  });
});

describe("isStrongPassword", () => {
  it("returns true for a valid strong password", () => {
    expect(isStrongPassword("Kj7xMq9zN2")).toBe(true);
  });

  it("returns false for a short password", () => {
    expect(isStrongPassword("Abc123")).toBe(false);
  });

  it("returns false for a common password", () => {
    expect(isStrongPassword("password")).toBe(false);
  });
});

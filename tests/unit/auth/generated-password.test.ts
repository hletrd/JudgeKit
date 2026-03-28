import { describe, expect, it } from "vitest";
import { generateSecurePassword } from "@/lib/auth/generated-password";

describe("generateSecurePassword", () => {
  it("generates a password of default length 16", () => {
    const password = generateSecurePassword();
    expect(password).toHaveLength(16);
  });

  it("generates a password of custom length", () => {
    expect(generateSecurePassword(8)).toHaveLength(8);
    expect(generateSecurePassword(32)).toHaveLength(32);
  });

  it("only contains characters from the allowed alphabet", () => {
    const allowed = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    for (let i = 0; i < 50; i++) {
      const password = generateSecurePassword();
      for (const char of password) {
        expect(allowed).toContain(char);
      }
    }
  });

  it("excludes ambiguous characters (0, O, 1, l, I)", () => {
    const ambiguous = ["0", "O", "1", "l", "I"];
    const passwords = Array.from({ length: 100 }, () => generateSecurePassword());
    for (const password of passwords) {
      for (const char of ambiguous) {
        expect(password).not.toContain(char);
      }
    }
  });

  it("generates unique passwords across calls", () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generateSecurePassword()));
    expect(passwords.size).toBe(100);
  });
});

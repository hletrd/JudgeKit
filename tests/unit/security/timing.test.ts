import { describe, expect, it } from "vitest";
import { safeTokenCompare } from "@/lib/security/timing";

describe("safeTokenCompare", () => {
  it("returns true for matching tokens", () => {
    expect(safeTokenCompare("abc123", "abc123")).toBe(true);
    expect(safeTokenCompare("token", "token")).toBe(true);
  });

  it("returns false for non-matching tokens", () => {
    expect(safeTokenCompare("abc123", "xyz789")).toBe(false);
    expect(safeTokenCompare("token1", "token2")).toBe(false);
  });

  it("returns false when tokens have different lengths", () => {
    expect(safeTokenCompare("short", "longer-token")).toBe(false);
    expect(safeTokenCompare("abc", "abcdef")).toBe(false);
  });

  it("returns false when one token is empty", () => {
    expect(safeTokenCompare("", "token")).toBe(false);
    expect(safeTokenCompare("token", "")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(safeTokenCompare("", "")).toBe(true);
  });

  it("compares case-sensitive tokens", () => {
    expect(safeTokenCompare("Token", "token")).toBe(false);
    expect(safeTokenCompare("TOKEN", "token")).toBe(false);
  });

  it("handles special characters in tokens", () => {
    expect(safeTokenCompare("t0k3n!@#$", "t0k3n!@#$")).toBe(true);
    expect(safeTokenCompare("t0k3n!@#$", "t0k3n!@#%")).toBe(false);
  });

  it("handles very long tokens", () => {
    const longToken = "a".repeat(1000);
    expect(safeTokenCompare(longToken, longToken)).toBe(true);
    expect(safeTokenCompare(longToken, longToken + "x")).toBe(false);
  });

  it("handles unicode characters", () => {
    expect(safeTokenCompare("안녕하세요", "안녕하세요")).toBe(true);
    expect(safeTokenCompare("안녕하세요", "こんにちは")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { trimString, normalizeOptionalString } from "@/lib/validators/preprocess";

describe("trimString", () => {
  it("trims leading and trailing whitespace from strings", () => {
    expect(trimString("  hello  ")).toBe("hello");
    expect(trimString("  ")).toBe("");
    expect(trimString("hello")).toBe("hello");
  });

  it("passes through non-string values unchanged", () => {
    expect(trimString(42)).toBe(42);
    expect(trimString(null)).toBe(null);
    expect(trimString(undefined)).toBe(undefined);
    expect(trimString(true)).toBe(true);
    expect(trimString({ key: "value" })).toEqual({ key: "value" });
  });
});

describe("normalizeOptionalString", () => {
  it("trims whitespace from strings", () => {
    expect(normalizeOptionalString("  hello  ")).toBe("hello");
    expect(normalizeOptionalString("hello")).toBe("hello");
  });

  it("converts blank/whitespace-only strings to undefined", () => {
    expect(normalizeOptionalString("")).toBe(undefined);
    expect(normalizeOptionalString("   ")).toBe(undefined);
    expect(normalizeOptionalString("\t\n")).toBe(undefined);
  });

  it("passes through non-string values unchanged", () => {
    expect(normalizeOptionalString(42)).toBe(42);
    expect(normalizeOptionalString(null)).toBe(null);
    expect(normalizeOptionalString(undefined)).toBe(undefined);
    expect(normalizeOptionalString(false)).toBe(false);
  });
});

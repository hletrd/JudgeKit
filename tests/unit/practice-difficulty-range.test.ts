import { describe, expect, it } from "vitest";
import {
  normalizeDifficultyRange,
  serializeDifficultyRange,
  hasCustomDifficultyRange,
} from "@/lib/practice/difficulty-range";

describe("practice difficulty range helpers", () => {
  it("normalizes valid ranges and swaps reversed bounds", () => {
    expect(normalizeDifficultyRange("3-7")).toEqual({ min: 3, max: 7 });
    expect(normalizeDifficultyRange("8-2")).toEqual({ min: 2, max: 8 });
  });

  it("falls back to the full range for invalid input and clamps out-of-range values", () => {
    expect(normalizeDifficultyRange(undefined)).toEqual({ min: 0, max: 10 });
    expect(normalizeDifficultyRange("oops")).toEqual({ min: 0, max: 10 });
    expect(normalizeDifficultyRange("-5-99")).toEqual({ min: 0, max: 10 });
  });

  it("serializes only custom ranges", () => {
    expect(hasCustomDifficultyRange({ min: 0, max: 10 })).toBe(false);
    expect(hasCustomDifficultyRange({ min: 2, max: 8 })).toBe(true);
    expect(serializeDifficultyRange({ min: 0, max: 10 })).toBe("");
    expect(serializeDifficultyRange({ min: 2, max: 8 })).toBe("2-8");
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { withUpdatedAt } from "@/lib/db/helpers";

describe("withUpdatedAt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("injects updatedAt with the current date", () => {
    const result = withUpdatedAt({ name: "Alice" });
    expect(result).toEqual({
      name: "Alice",
      updatedAt: new Date("2025-06-15T12:00:00Z"),
    });
  });

  it("preserves all original fields", () => {
    const result = withUpdatedAt({ a: 1, b: "two", c: true });
    expect(result).toMatchObject({ a: 1, b: "two", c: true });
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("overrides an existing updatedAt field", () => {
    const result = withUpdatedAt({ updatedAt: new Date("2000-01-01") });
    expect(result.updatedAt).toEqual(new Date("2025-06-15T12:00:00Z"));
  });

  it("works with an empty object", () => {
    const result = withUpdatedAt({});
    expect(result).toEqual({ updatedAt: new Date("2025-06-15T12:00:00Z") });
  });
});

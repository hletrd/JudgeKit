import { describe, expect, it } from "vitest";
import {
  formatDateTimeLocalInput,
  parseDateTimeLocalInput, formatRelativeTimeFromNow } from "@/lib/datetime";

describe("formatRelativeTimeFromNow", () => {
  const baseNow = new Date("2026-03-10T00:00:00.000Z").valueOf();

  it("formats future times relative to now", () => {
    expect(
      formatRelativeTimeFromNow("2026-03-12T00:00:00.000Z", "en-US", baseNow)
    ).toContain("in 2 days");
  });

  it("formats past times relative to now", () => {
    expect(
      formatRelativeTimeFromNow("2026-03-09T00:00:00.000Z", "en-US", baseNow)
    ).toMatch(/yesterday|1 day ago/);
  });

  it("returns a placeholder for invalid dates", () => {
    expect(formatRelativeTimeFromNow("not-a-date", "en-US", baseNow)).toBe("-");
  });
});

describe("formatDateTimeLocalInput / parseDateTimeLocalInput", () => {
  it("round-trips an instant through a non-UTC zone", () => {
    // 2026-07-10 23:59 KST == 2026-07-10T14:59:00Z
    const epochMs = Date.UTC(2026, 6, 10, 14, 59);
    const input = formatDateTimeLocalInput(epochMs, "Asia/Seoul");
    expect(input).toBe("2026-07-10T23:59");
    expect(parseDateTimeLocalInput(input, "Asia/Seoul")).toBe(epochMs);
  });

  it("interprets the same wall-clock differently per zone", () => {
    const seoul = parseDateTimeLocalInput("2026-07-10T23:59", "Asia/Seoul");
    const utc = parseDateTimeLocalInput("2026-07-10T23:59", "UTC");
    expect(utc! - seoul!).toBe(9 * 60 * 60 * 1000);
  });

  it("handles DST transitions via two-pass offset resolution", () => {
    // America/New_York enters DST on 2026-03-08: 02:00 EST jumps to 03:00 EDT.
    // 2026-03-08T03:30 local is EDT (UTC-4) → 07:30Z.
    expect(parseDateTimeLocalInput("2026-03-08T03:30", "America/New_York")).toBe(
      Date.UTC(2026, 2, 8, 7, 30)
    );
    // The day before is EST (UTC-5).
    expect(parseDateTimeLocalInput("2026-03-07T03:30", "America/New_York")).toBe(
      Date.UTC(2026, 2, 7, 8, 30)
    );
  });

  it("accepts optional seconds and rejects invalid input", () => {
    expect(parseDateTimeLocalInput("2026-07-10T23:59:59", "UTC")).toBe(
      Date.UTC(2026, 6, 10, 23, 59, 59)
    );
    expect(parseDateTimeLocalInput("", "UTC")).toBeNull();
    expect(parseDateTimeLocalInput("not-a-date", "UTC")).toBeNull();
    expect(parseDateTimeLocalInput("2026-07-10", "UTC")).toBeNull();
  });

  it("formats null/invalid values as empty string", () => {
    expect(formatDateTimeLocalInput(null, "UTC")).toBe("");
    expect(formatDateTimeLocalInput(Number.NaN, "UTC")).toBe("");
  });
});

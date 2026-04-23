import { describe, expect, it } from "vitest";
import { formatNumber, formatBytes, formatScore, formatDifficulty, formatDuration } from "@/lib/formatting";

describe("formatNumber", () => {
  it("formats integers with locale grouping", () => {
    expect(formatNumber(1234)).toBe("1,234");
  });

  it("formats decimals with default locale", () => {
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats negative numbers", () => {
    expect(formatNumber(-1234)).toBe("-1,234");
  });

  it("respects maximumFractionDigits option", () => {
    expect(formatNumber(85.567, { maximumFractionDigits: 1 })).toBe("85.6");
  });

  it("respects minimumFractionDigits option", () => {
    expect(formatNumber(3, { minimumFractionDigits: 1 })).toBe("3.0");
  });

  it("respects both minimumFractionDigits and maximumFractionDigits", () => {
    expect(formatNumber(3.4, { minimumFractionDigits: 1, maximumFractionDigits: 2 })).toBe("3.4");
  });

  it("accepts legacy positional locale parameter", () => {
    // Legacy API: formatNumber(value, locale)
    const result = formatNumber(1234, "en-US");
    expect(result).toBe("1,234");
  });

  it("formats large numbers with grouping", () => {
    expect(formatNumber(1000000)).toBe("1,000,000");
  });
});

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats kilobytes with decimal", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("respects locale for digit grouping in larger values", () => {
    // 1,024 KB with locale grouping
    const result = formatBytes(1048576, "en-US");
    expect(result).toBe("1 MB");
  });
});

describe("formatScore", () => {
  it("returns dash for null", () => {
    expect(formatScore(null)).toBe("-");
  });

  it("returns dash for undefined", () => {
    expect(formatScore(undefined)).toBe("-");
  });

  it("formats zero", () => {
    expect(formatScore(0)).toBe("0");
  });

  it("rounds to two decimal places", () => {
    expect(formatScore(1.234)).toBe("1.23");
  });

  it("handles negative scores", () => {
    expect(formatScore(-1.5)).toBe("-1.5");
  });

  it("handles large scores with locale grouping", () => {
    expect(formatScore(9999.999)).toBe("10,000");
  });

  it("formats scores with locale grouping", () => {
    expect(formatScore(1234.5)).toBe("1,234.5");
  });

  it("respects locale parameter", () => {
    const result = formatScore(1234.5, "ko-KR");
    expect(result).toContain("234.5");
  });
});

describe("formatDifficulty", () => {
  it("formats integer difficulty without trailing zeros", () => {
    expect(formatDifficulty(3)).toBe("3");
  });

  it("formats difficulty with one decimal place", () => {
    expect(formatDifficulty(3.1)).toBe("3.1");
  });

  it("formats difficulty with two decimal places", () => {
    expect(formatDifficulty(3.14)).toBe("3.14");
  });

  it("strips trailing zero from one decimal place", () => {
    expect(formatDifficulty(3.1)).toBe("3.1");
  });

  it("strips both trailing zeros from two decimal places", () => {
    expect(formatDifficulty(3.0)).toBe("3");
  });

  it("strips one trailing zero from two decimal places", () => {
    expect(formatDifficulty(3.1)).toBe("3.1");
  });

  it("formats zero difficulty", () => {
    expect(formatDifficulty(0)).toBe("0");
  });

  it("formats large difficulty with locale grouping", () => {
    expect(formatDifficulty(1234.5)).toBe("1,234.5");
  });

  it("formats negative difficulty", () => {
    expect(formatDifficulty(-3.14)).toBe("-3.14");
  });

  it("respects locale parameter", () => {
    // Korean locale still uses Western grouping for numbers
    const result = formatDifficulty(1234.5, "ko-KR");
    expect(result).toContain("234.5");
  });

  it("rounds more than two decimal places", () => {
    expect(formatDifficulty(3.141)).toBe("3.14");
  });

  it("preserves one significant decimal when other is zero", () => {
    expect(formatDifficulty(3.5)).toBe("3.5");
  });
});

describe("formatDuration", () => {
  it("formats zero milliseconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats seconds only", () => {
    expect(formatDuration(30000)).toBe("00:00:30");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90000)).toBe("00:01:30");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(3661000)).toBe("01:01:01");
  });

  it("formats negative values as zero", () => {
    expect(formatDuration(-1000)).toBe("00:00:00");
  });

  it("formats NaN as zero", () => {
    expect(formatDuration(NaN)).toBe("00:00:00");
  });

  it("formats Infinity as zero", () => {
    expect(formatDuration(Infinity)).toBe("00:00:00");
  });

  it("formats a typical exam duration", () => {
    // 2 hours, 30 minutes, 0 seconds
    expect(formatDuration(9000000)).toBe("02:30:00");
  });

  it("pads single-digit values with zeros", () => {
    expect(formatDuration(3661000)).toBe("01:01:01");
  });
});

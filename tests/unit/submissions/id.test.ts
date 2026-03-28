import { describe, expect, it } from "vitest";
import {
  generateSubmissionId,
  formatSubmissionIdPrefix,
  SUBMISSION_ID_LENGTH,
  SUBMISSION_ID_VISIBLE_PREFIX_LENGTH,
} from "@/lib/submissions/id";

describe("generateSubmissionId", () => {
  it("returns a hex string of SUBMISSION_ID_LENGTH characters", () => {
    const id = generateSubmissionId();
    expect(id).toHaveLength(SUBMISSION_ID_LENGTH);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique IDs across multiple calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateSubmissionId()));
    expect(ids.size).toBe(100);
  });
});

describe("formatSubmissionIdPrefix", () => {
  it("returns the first SUBMISSION_ID_VISIBLE_PREFIX_LENGTH characters", () => {
    const id = "abcdef1234567890abcdef1234567890";
    const prefix = formatSubmissionIdPrefix(id);
    expect(prefix).toBe(id.slice(0, SUBMISSION_ID_VISIBLE_PREFIX_LENGTH));
    expect(prefix).toHaveLength(SUBMISSION_ID_VISIBLE_PREFIX_LENGTH);
  });

  it("returns the full string when shorter than prefix length", () => {
    const short = "abc";
    expect(formatSubmissionIdPrefix(short)).toBe("abc");
  });
});

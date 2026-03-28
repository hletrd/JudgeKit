import { describe, expect, it } from "vitest";
import {
  ACTIVE_SUBMISSION_STATUSES,
  isActiveSubmissionStatus,
  getSubmissionStatusVariant,
} from "@/lib/submissions/status";

describe("ACTIVE_SUBMISSION_STATUSES", () => {
  it("contains pending, queued, and judging", () => {
    expect(ACTIVE_SUBMISSION_STATUSES).toEqual(new Set(["pending", "queued", "judging"]));
  });
});

describe("isActiveSubmissionStatus", () => {
  it.each(["pending", "queued", "judging"])("returns true for active status '%s'", (status) => {
    expect(isActiveSubmissionStatus(status)).toBe(true);
  });

  it.each(["accepted", "wrong_answer", "compile_error", "runtime_error", "time_limit_exceeded"])(
    "returns false for terminal status '%s'",
    (status) => {
      expect(isActiveSubmissionStatus(status)).toBe(false);
    }
  );

  it("returns false for null", () => {
    expect(isActiveSubmissionStatus(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isActiveSubmissionStatus(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isActiveSubmissionStatus("")).toBe(false);
  });
});

describe("getSubmissionStatusVariant", () => {
  it("returns 'default' for accepted", () => {
    expect(getSubmissionStatusVariant("accepted")).toBe("default");
  });

  it.each(["pending", "queued", "judging"])(
    "returns 'secondary' for active status '%s'",
    (status) => {
      expect(getSubmissionStatusVariant(status)).toBe("secondary");
    }
  );

  it.each(["wrong_answer", "compile_error", "runtime_error", "time_limit_exceeded"])(
    "returns 'destructive' for error status '%s'",
    (status) => {
      expect(getSubmissionStatusVariant(status)).toBe("destructive");
    }
  );

  it("returns 'destructive' for null", () => {
    expect(getSubmissionStatusVariant(null)).toBe("destructive");
  });

  it("returns 'destructive' for undefined", () => {
    expect(getSubmissionStatusVariant(undefined)).toBe("destructive");
  });
});

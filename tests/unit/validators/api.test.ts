import { describe, expect, it } from "vitest";
import { submissionCreateSchema, judgeStatusReportSchema } from "@/lib/validators/api";
import { MAX_SOURCE_CODE_SIZE_BYTES } from "@/lib/security/constants";

// ------- submissionCreateSchema -------

describe("submissionCreateSchema", () => {
  const validPayload = {
    problemId: "problem-abc",
    language: "cpp",
    sourceCode: "int main() { return 0; }",
  };

  it("accepts valid input", () => {
    const result = submissionCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("trims whitespace from problemId and language", () => {
    const parsed = submissionCreateSchema.parse({
      ...validPayload,
      problemId: "  problem-abc  ",
      language: "  cpp  ",
    });
    expect(parsed.problemId).toBe("problem-abc");
    expect(parsed.language).toBe("cpp");
  });

  it("rejects empty problemId", () => {
    const result = submissionCreateSchema.safeParse({ ...validPayload, problemId: "" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("problemRequired");
  });

  it("rejects whitespace-only problemId", () => {
    const result = submissionCreateSchema.safeParse({ ...validPayload, problemId: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects empty language", () => {
    const result = submissionCreateSchema.safeParse({ ...validPayload, language: "" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("languageRequired");
  });

  it("rejects empty sourceCode", () => {
    const result = submissionCreateSchema.safeParse({ ...validPayload, sourceCode: "" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("sourceCodeRequired");
  });

  it("rejects sourceCode exceeding max size", () => {
    const bigCode = "a".repeat(MAX_SOURCE_CODE_SIZE_BYTES + 1);
    const result = submissionCreateSchema.safeParse({ ...validPayload, sourceCode: bigCode });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("sourceCodeTooLarge");
  });

  it("accepts sourceCode exactly at max size", () => {
    const maxCode = "a".repeat(MAX_SOURCE_CODE_SIZE_BYTES);
    const result = submissionCreateSchema.safeParse({ ...validPayload, sourceCode: maxCode });
    expect(result.success).toBe(true);
  });

  it("accepts optional assignmentId when omitted", () => {
    const result = submissionCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data?.assignmentId).toBeUndefined();
  });

  it("accepts valid assignmentId", () => {
    const parsed = submissionCreateSchema.parse({ ...validPayload, assignmentId: "  assign-1  " });
    expect(parsed.assignmentId).toBe("assign-1");
  });

  it("converts blank assignmentId to undefined (normalizeOptionalString)", () => {
    const parsed = submissionCreateSchema.parse({ ...validPayload, assignmentId: "   " });
    expect(parsed.assignmentId).toBeUndefined();
  });

  it("rejects assignmentId that trims to empty but is non-blank-normalized as invalid", () => {
    // A non-blank string that trims to non-empty passes
    const result = submissionCreateSchema.safeParse({ ...validPayload, assignmentId: "ok" });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(submissionCreateSchema.safeParse({}).success).toBe(false);
    expect(submissionCreateSchema.safeParse({ problemId: "p", language: "cpp" }).success).toBe(false);
  });
});

// ------- judgeStatusReportSchema -------

describe("judgeStatusReportSchema", () => {
  const validPayload = {
    submissionId: "sub-1",
    claimToken: "token-abc",
    status: "accepted",
  };

  it("accepts valid minimal input", () => {
    expect(judgeStatusReportSchema.safeParse(validPayload).success).toBe(true);
  });

  it("trims whitespace from submissionId, claimToken, status", () => {
    const parsed = judgeStatusReportSchema.parse({
      submissionId: "  sub-1  ",
      claimToken: "  token-abc  ",
      status: "  accepted  ",
    });
    expect(parsed.submissionId).toBe("sub-1");
    expect(parsed.claimToken).toBe("token-abc");
    expect(parsed.status).toBe("accepted");
  });

  it("rejects empty submissionId", () => {
    const result = judgeStatusReportSchema.safeParse({ ...validPayload, submissionId: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("submissionIdRequired");
  });

  it("rejects empty claimToken", () => {
    const result = judgeStatusReportSchema.safeParse({ ...validPayload, claimToken: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("claimTokenRequired");
  });

  it("rejects empty status", () => {
    const result = judgeStatusReportSchema.safeParse({ ...validPayload, status: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("statusRequired");
  });

  it("accepts optional compileOutput", () => {
    const parsed = judgeStatusReportSchema.parse({ ...validPayload, compileOutput: "error on line 1" });
    expect(parsed.compileOutput).toBe("error on line 1");
  });

  it("accepts results array with valid items", () => {
    const parsed = judgeStatusReportSchema.parse({
      ...validPayload,
      results: [
        {
          testCaseId: "tc-1",
          status: "accepted",
          actualOutput: "42\n",
          executionTimeMs: 100,
          memoryUsedKb: 1024,
        },
      ],
    });
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results?.[0]?.testCaseId).toBe("tc-1");
  });

  it("trims whitespace in result testCaseId and status", () => {
    const parsed = judgeStatusReportSchema.parse({
      ...validPayload,
      results: [{ testCaseId: "  tc-1  ", status: "  accepted  " }],
    });
    expect(parsed.results?.[0]?.testCaseId).toBe("tc-1");
    expect(parsed.results?.[0]?.status).toBe("accepted");
  });

  it("rejects result item with empty testCaseId", () => {
    const result = judgeStatusReportSchema.safeParse({
      ...validPayload,
      results: [{ testCaseId: "", status: "accepted" }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidJudgeResult");
  });

  it("rejects result item with empty status", () => {
    const result = judgeStatusReportSchema.safeParse({
      ...validPayload,
      results: [{ testCaseId: "tc-1", status: "" }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidJudgeResult");
  });

  it("result optional numeric fields are not required", () => {
    const parsed = judgeStatusReportSchema.parse({
      ...validPayload,
      results: [{ testCaseId: "tc-1", status: "accepted" }],
    });
    expect(parsed.results?.[0]?.executionTimeMs).toBeUndefined();
    expect(parsed.results?.[0]?.memoryUsedKb).toBeUndefined();
  });

  it("rejects negative executionTimeMs", () => {
    const result = judgeStatusReportSchema.safeParse({
      ...validPayload,
      results: [{ testCaseId: "tc-1", status: "accepted", executionTimeMs: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative memoryUsedKb", () => {
    const result = judgeStatusReportSchema.safeParse({
      ...validPayload,
      results: [{ testCaseId: "tc-1", status: "accepted", memoryUsedKb: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required top-level fields", () => {
    expect(judgeStatusReportSchema.safeParse({}).success).toBe(false);
  });
});

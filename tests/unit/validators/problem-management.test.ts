import { describe, expect, it } from "vitest";
import {
  problemDescriptionSchema,
  problemMutationSchema,
  problemTestCaseSchema,
  problemVisibilityValues,
} from "@/lib/validators/problem-management";

function makeProblemDescription(statement = "Given an integer N, print N."): string {
  return [
    "### Problem",
    statement,
    "",
    "### Input",
    "A single line containing one integer.",
    "",
    "### Output",
    "Print the requested value.",
    "",
    "### Constraints",
    "- 0 <= N <= 100",
    "",
    "### Examples",
    "**Input 1**",
    "```",
    "1",
    "```",
    "",
    "**Output 1**",
    "```",
    "1",
    "```",
    "",
    "Explanation: the input is already the requested value.",
  ].join("\n");
}

// ------- problemTestCaseSchema -------

describe("problemTestCaseSchema", () => {
  const validTestCase = {
    input: "5\n",
    expectedOutput: "25\n",
  };

  it("accepts valid test case", () => {
    const result = problemTestCaseSchema.safeParse(validTestCase);
    expect(result.success).toBe(true);
  });

  it("defaults isVisible to false", () => {
    const parsed = problemTestCaseSchema.parse(validTestCase);
    expect(parsed.isVisible).toBe(false);
  });

  it("accepts isVisible = true", () => {
    const parsed = problemTestCaseSchema.parse({ ...validTestCase, isVisible: true });
    expect(parsed.isVisible).toBe(true);
  });

  it("accepts empty input (output-only problems)", () => {
    const result = problemTestCaseSchema.safeParse({ ...validTestCase, input: "" });
    expect(result.success).toBe(true);
    expect(result.data?.input).toBe("");
  });

  it("rejects empty expectedOutput", () => {
    const result = problemTestCaseSchema.safeParse({ ...validTestCase, expectedOutput: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("testCaseOutputRequired");
  });

  it("defaults missing input to empty string", () => {
    const result = problemTestCaseSchema.safeParse({ expectedOutput: "25\n" });
    expect(result.success).toBe(true);
    expect(result.data?.input).toBe("");
  });

  it("rejects missing expectedOutput", () => {
    const result = problemTestCaseSchema.safeParse({ input: "5\n" });
    expect(result.success).toBe(false);
  });
});

// ------- problemMutationSchema -------

describe("problemMutationSchema", () => {
  const validPayload = {
    title: "Two Sum",
    description: makeProblemDescription(),
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    visibility: "public",
  };

  it("accepts valid minimal input", () => {
    const result = problemMutationSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects missing description", () => {
    const { description: _description, ...withoutDescription } = validPayload;
    const result = problemMutationSchema.safeParse(withoutDescription);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("descriptionRequired");
  });

  it("defaults testCases to empty array", () => {
    const parsed = problemMutationSchema.parse(validPayload);
    expect(parsed.testCases).toEqual([]);
  });

  it("trims whitespace from title", () => {
    const parsed = problemMutationSchema.parse({ ...validPayload, title: "  Two Sum  " });
    expect(parsed.title).toBe("Two Sum");
  });

  it("rejects empty title", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, title: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("titleRequired");
  });

  it("rejects whitespace-only title", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, title: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 200 characters", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, title: "a".repeat(201) });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("titleTooLong");
  });

  it("accepts title at exactly 200 characters", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, title: "a".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("rejects description longer than 50000 characters", () => {
    const result = problemMutationSchema.safeParse({
      ...validPayload,
      description: makeProblemDescription("a".repeat(50000)),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("descriptionTooLong");
  });

  it("accepts description at exactly 50000 characters", () => {
    const baseDescription = makeProblemDescription("");
    const statement = "a".repeat(50000 - baseDescription.length);
    const result = problemMutationSchema.safeParse({
      ...validPayload,
      description: makeProblemDescription(statement),
    });
    expect(result.success).toBe(true);
  });

  it("rejects HTML problem descriptions", () => {
    const result = problemDescriptionSchema.safeParse("<h3>Problem</h3><p>Use HTML.</p>");
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("descriptionMarkdownOnly");
  });

  it("rejects descriptions without the mandatory sections and examples", () => {
    const result = problemDescriptionSchema.safeParse("### Problem\nOnly a statement.");
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages).toContain("descriptionFormatRequired");
    expect(messages).toContain("descriptionExampleRequired");
  });

  it("rejects timeLimitMs below 100", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, timeLimitMs: 99 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidTimeLimit");
  });

  it("accepts timeLimitMs at exactly 100", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, timeLimitMs: 100 });
    expect(result.success).toBe(true);
  });

  it("rejects timeLimitMs above 10000", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, timeLimitMs: 10001 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidTimeLimit");
  });

  it("accepts timeLimitMs at exactly 10000", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, timeLimitMs: 10000 });
    expect(result.success).toBe(true);
  });

  it("rejects memoryLimitMb below 16", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, memoryLimitMb: 15 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidMemoryLimit");
  });

  it("accepts memoryLimitMb at exactly 16", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, memoryLimitMb: 16 });
    expect(result.success).toBe(true);
  });

  it("rejects memoryLimitMb above 1024", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, memoryLimitMb: 1025 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("invalidMemoryLimit");
  });

  it("accepts memoryLimitMb at exactly 1024", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, memoryLimitMb: 1024 });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer timeLimitMs", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, timeLimitMs: 500.5 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer memoryLimitMb", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, memoryLimitMb: 256.5 });
    expect(result.success).toBe(false);
  });

  it("accepts all valid visibility values", () => {
    for (const visibility of problemVisibilityValues) {
      const result = problemMutationSchema.safeParse({ ...validPayload, visibility });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid visibility value", () => {
    const result = problemMutationSchema.safeParse({ ...validPayload, visibility: "secret" });
    expect(result.success).toBe(false);
  });

  it("accepts testCases array with valid items", () => {
    const result = problemMutationSchema.safeParse({
      ...validPayload,
      testCases: [{ input: "1\n", expectedOutput: "1\n", isVisible: true }],
    });
    expect(result.success).toBe(true);
    expect(result.data?.testCases).toHaveLength(1);
  });

  it("rejects more than 100 test cases", () => {
    const testCases = Array.from({ length: 101 }, () => ({
      input: "1\n",
      expectedOutput: "1\n",
    }));
    const result = problemMutationSchema.safeParse({ ...validPayload, testCases });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("tooManyTestCases");
  });

  it("accepts exactly 100 test cases", () => {
    const testCases = Array.from({ length: 100 }, () => ({
      input: "1\n",
      expectedOutput: "1\n",
    }));
    const result = problemMutationSchema.safeParse({ ...validPayload, testCases });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(problemMutationSchema.safeParse({}).success).toBe(false);
    expect(problemMutationSchema.safeParse({ title: "T" }).success).toBe(false);
  });

  it("rejects function problems whose enabled languages have no harness support", () => {
    const result = problemMutationSchema.safeParse({
      ...validPayload,
      problemType: "function",
      functionSpec: {
        functionName: "solve",
        params: [{ name: "x", type: "int" }],
        returnType: "int",
        enabledLanguages: ["brainfuck"],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(
      "functionSpecUnsupportedLanguages",
    );
  });

  it("accepts function problems with at least one supported harness language", () => {
    const result = problemMutationSchema.safeParse({
      ...validPayload,
      problemType: "function",
      functionSpec: {
        functionName: "solve",
        params: [{ name: "x", type: "int" }],
        returnType: "int",
        enabledLanguages: ["brainfuck", "python"],
      },
    });

    expect(result.success).toBe(true);
  });
});

// ------- problemVisibilityValues -------

describe("problemVisibilityValues", () => {
  it("contains expected values", () => {
    expect(problemVisibilityValues).toContain("public");
    expect(problemVisibilityValues).toContain("private");
    expect(problemVisibilityValues).toContain("hidden");
    expect(problemVisibilityValues).toHaveLength(3);
  });
});

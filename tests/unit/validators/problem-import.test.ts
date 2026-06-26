import { describe, expect, it } from "vitest";
import { problemImportSchema } from "@/app/api/v1/problems/import/route";

const VALID_DESCRIPTION = [
  "### Problem",
  "Return the integer passed to the function.",
  "",
  "### Input",
  "A single line containing one integer.",
  "",
  "### Output",
  "Print the same integer.",
  "",
  "### Constraints",
  "- 0 <= x <= 100",
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
  "Explanation: the identity function returns its input.",
].join("\n");

const BASE_IMPORT = {
  version: 1,
  problem: {
    title: "Function Import",
    description: VALID_DESCRIPTION,
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    visibility: "private",
    testCases: [{ input: "1\n", expectedOutput: "1\n" }],
  },
};

const FUNCTION_SPEC = {
  functionName: "solve",
  params: [{ name: "x", type: "int" }],
  returnType: "int",
  enabledLanguages: ["python"],
};

describe("problemImportSchema", () => {
  it("accepts function-signature problem imports", () => {
    const result = problemImportSchema.safeParse({
      ...BASE_IMPORT,
      problem: {
        ...BASE_IMPORT.problem,
        problemType: "function",
        functionSpec: FUNCTION_SPEC,
        referenceSolution: { language: "python", source: "def solve(x): return x" },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects function imports without a functionSpec", () => {
    const result = problemImportSchema.safeParse({
      ...BASE_IMPORT,
      problem: {
        ...BASE_IMPORT.problem,
        problemType: "function",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("functionSpecRequired");
  });

  it("uses the same time limit ceiling as the editor schema", () => {
    const result = problemImportSchema.safeParse({
      ...BASE_IMPORT,
      problem: {
        ...BASE_IMPORT.problem,
        timeLimitMs: 30000,
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects imported problems that violate the mandatory Markdown description format", () => {
    const result = problemImportSchema.safeParse({
      ...BASE_IMPORT,
      problem: {
        ...BASE_IMPORT.problem,
        description: "<h3>Problem</h3><p>HTML is not allowed.</p>",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "descriptionMarkdownOnly",
    );
  });

  it("rejects imported test cases with empty expected output", () => {
    const result = problemImportSchema.safeParse({
      ...BASE_IMPORT,
      problem: {
        ...BASE_IMPORT.problem,
        testCases: [{ input: "1\n", expectedOutput: "" }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "testCaseOutputRequired",
    );
  });

  it("rejects imported problems with more than 100 test cases", () => {
    const result = problemImportSchema.safeParse({
      ...BASE_IMPORT,
      problem: {
        ...BASE_IMPORT.problem,
        testCases: Array.from({ length: 101 }, (_, index) => ({
          input: `${index}\n`,
          expectedOutput: `${index}\n`,
        })),
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "tooManyTestCases",
    );
  });

  it("round-trips a function-typed export payload preserving problemType and functionSpec", () => {
    // Shape mirrors the per-problem export route output (problem row + tags +
    // testCases). The export must carry problemType/functionSpec/referenceSolution
    // so a function problem survives export → import without downgrading to "auto".
    const exportedProblem = {
      title: "Function Round-Trip",
      description: VALID_DESCRIPTION,
      sequenceNumber: 1,
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      problemType: "function",
      functionSpec: FUNCTION_SPEC,
      referenceSolution: { language: "python", source: "def solve(x): return x" },
      visibility: "private",
      showCompileOutput: true,
      showDetailedResults: true,
      showRuntimeErrors: true,
      allowAiAssistant: true,
      comparisonMode: "exact",
      floatAbsoluteError: null,
      floatRelativeError: null,
      difficulty: 4,
      tags: ["functions"],
      testCases: [{ input: "1\n", expectedOutput: "1\n", isVisible: false }],
    };

    const result = problemImportSchema.safeParse({
      version: 1,
      problem: exportedProblem,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.problem.problemType).toBe("function");
    expect(result.data.problem.functionSpec).not.toBeNull();
    expect(result.data.problem.functionSpec).toEqual(FUNCTION_SPEC);
    expect(result.data.problem.referenceSolution).toEqual({
      language: "python",
      source: "def solve(x): return x",
    });
  });
});

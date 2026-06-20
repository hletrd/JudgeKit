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
});

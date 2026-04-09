import { describe, expect, it, vi } from "vitest";

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "new-test-case-id"),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  execTransaction: vi.fn(),
}));

vi.mock("@/lib/security/sanitize-html", () => ({
  sanitizeMarkdown: (value: string) => value,
}));

import { planProblemTestCaseSync } from "@/lib/problem-management";

describe("planProblemTestCaseSync", () => {
  it("preserves unchanged test cases and only updates sort order when reordered", () => {
    const plan = planProblemTestCaseSync(
      "problem-1",
      [
        {
          id: "tc-1",
          input: "1\n",
          expectedOutput: "2\n",
          isVisible: true,
          sortOrder: 0,
        },
        {
          id: "tc-2",
          input: "3\n",
          expectedOutput: "4\n",
          isVisible: false,
          sortOrder: 1,
        },
      ],
      [
        { input: "3\n", expectedOutput: "4\n", isVisible: false },
        { input: "1\n", expectedOutput: "2\n", isVisible: true },
      ]
    );

    expect(plan.inserts).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.updates).toEqual([
      { id: "tc-2", sortOrder: 0 },
      { id: "tc-1", sortOrder: 1 },
    ]);
  });

  it("creates new rows for changed test cases and deletes obsolete ones", () => {
    const plan = planProblemTestCaseSync(
      "problem-1",
      [
        {
          id: "tc-1",
          input: "1\n",
          expectedOutput: "2\n",
          isVisible: true,
          sortOrder: 0,
        },
      ],
      [
        { input: "1\n", expectedOutput: "3\n", isVisible: true },
      ]
    );

    expect(plan.updates).toEqual([]);
    expect(plan.deleteIds).toEqual(["tc-1"]);
    expect(plan.inserts).toEqual([
      {
        id: "new-test-case-id",
        problemId: "problem-1",
        input: "1\n",
        expectedOutput: "3\n",
        isVisible: true,
        sortOrder: 0,
      },
    ]);
  });
});

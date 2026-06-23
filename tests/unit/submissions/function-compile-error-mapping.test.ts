import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Integration of the function-judging compile-error remapper into the central
 * submission sanitizer. Compile output for a `function`-type submission must be
 * rewritten to student-relative line numbers, and only when the
 * showCompileOutput gate lets the output through. Non-function submissions are
 * left untouched.
 */

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      assignments: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { sanitizeSubmissionForViewer } from "@/lib/submissions/visibility";

const PYTHON_SPEC = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" }],
  returnType: "int[]",
  enabledLanguages: ["python"],
};

// The python prelude is 1 line ("import sys, json\n"), so a compiler error on
// line 4 of the assembled source maps to line 3 of the student's code.
const PRELUDE_LINES = 1;

const NO_CAPS = new Set<string>();

function functionSubmission(overrides: Record<string, unknown> = {}) {
  return {
    userId: "owner-1",
    assignmentId: null,
    language: "python",
    status: "compile_error",
    compileOutput: "solution.py:4:5: SyntaxError: invalid syntax\ncheck line 4",
    problem: {
      id: "p1",
      problemType: "function",
      functionSpec: PYTHON_SPEC,
      showCompileOutput: true,
      showDetailedResults: true,
      showRuntimeErrors: true,
    },
    results: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sanitizeSubmissionForViewer — function compile-error mapping", () => {
  it("remaps compile-error line numbers for a function submission shown to its owner", async () => {
    const sanitized = await sanitizeSubmissionForViewer(
      functionSubmission(),
      "owner-1",
      NO_CAPS,
    );
    const expectedLine = 4 - PRELUDE_LINES;
    expect(sanitized.compileOutput).toBe(
      `solution.py:${expectedLine}:5: SyntaxError: invalid syntax\ncheck line ${expectedLine}`,
    );
  });

  it("does not remap when showCompileOutput is false (output is nulled first)", async () => {
    const sanitized = await sanitizeSubmissionForViewer(
      functionSubmission({
        problem: {
          id: "p1",
          problemType: "function",
          functionSpec: PYTHON_SPEC,
          showCompileOutput: false,
          showDetailedResults: true,
          showRuntimeErrors: true,
        },
      }),
      "owner-1",
      NO_CAPS,
    );
    expect(sanitized.compileOutput).toBeNull();
  });

  it("leaves an auto problem's compile output untouched", async () => {
    const sanitized = await sanitizeSubmissionForViewer(
      functionSubmission({
        problem: {
          id: "p1",
          problemType: "auto",
          functionSpec: null,
          showCompileOutput: true,
          showDetailedResults: true,
          showRuntimeErrors: true,
        },
      }),
      "owner-1",
      NO_CAPS,
    );
    expect(sanitized.compileOutput).toBe(
      "solution.py:4:5: SyntaxError: invalid syntax\ncheck line 4",
    );
  });

  it("leaves output untouched for a function problem in an unsupported language", async () => {
    const sanitized = await sanitizeSubmissionForViewer(
      functionSubmission({ language: "brainfuck" }),
      "owner-1",
      NO_CAPS,
    );
    expect(sanitized.compileOutput).toBe(
      "solution.py:4:5: SyntaxError: invalid syntax\ncheck line 4",
    );
  });

  it("remaps compile output on scoped submission review pages before rendering badges", () => {
    const contestParticipantPage = readFileSync(
      join(process.cwd(), "src/app/(public)/contests/manage/[assignmentId]/participant/[userId]/submissions/page.tsx"),
      "utf8",
    );
    const groupStudentPage = readFileSync(
      join(process.cwd(), "src/app/(public)/groups/[id]/assignments/[assignmentId]/student/[userId]/page.tsx"),
      "utf8",
    );

    for (const source of [contestParticipantPage, groupStudentPage]) {
      expect(source).toContain("mapFunctionCompileOutputForDisplay");
      expect(source).toContain("functionSpec");
      expect(source).toContain("problemType");
    }
  });
});

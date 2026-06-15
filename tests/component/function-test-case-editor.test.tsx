import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { FunctionTestCaseEditor } from "@/components/problem/function-test-case-editor";
import {
  createInitialProblemTestCaseDrafts,
  type ProblemTestCaseDraft,
} from "@/lib/problems/test-case-drafts";
import type { FunctionType } from "@/lib/judge/function-judging/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const params: { name: string; type: FunctionType }[] = [
  { name: "nums", type: "int[]" },
  { name: "target", type: "int" },
];

function Harness({ initial, version }: { initial: ProblemTestCaseDraft[]; version?: number }) {
  const [cases, setCases] = useState<ProblemTestCaseDraft[]>(initial);
  return (
    <>
      <FunctionTestCaseEditor
        params={params}
        returnType="int[]"
        testCases={cases}
        onChange={setCases}
        expectedOutputsVersion={version}
      />
      <output data-testid="cases">{JSON.stringify(cases)}</output>
    </>
  );
}

function currentCases(): ProblemTestCaseDraft[] {
  return JSON.parse(screen.getByTestId("cases").textContent ?? "[]");
}

describe("FunctionTestCaseEditor", () => {
  it("serializes typed args and return into the test_cases draft shape", () => {
    render(<Harness initial={createInitialProblemTestCaseDrafts([{ input: "", expectedOutput: "", isVisible: false }])} />);

    // One field per param + one expected-return field.
    fireEvent.change(screen.getByLabelText(/nums/), { target: { value: "2, 7, 11, 15" } });
    fireEvent.change(screen.getByLabelText(/target/), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/fnExpectedReturnLabel/), { target: { value: "0, 1" } });

    const [c] = currentCases();
    expect(c.input).toBe("[[2,7,11,15],9]");
    expect(c.expectedOutput).toBe("[0,1]");
  });

  it("preserves the visible toggle and supports add/remove", () => {
    render(<Harness initial={createInitialProblemTestCaseDrafts([{ input: "", expectedOutput: "", isVisible: false }])} />);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(currentCases()[0].isVisible).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "addTestCase" }));
    expect(currentCases()).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: /removeTestCase/ })[0]);
    expect(currentCases()).toHaveLength(1);
  });

  it("surfaces inline type errors for invalid values", () => {
    render(<Harness initial={createInitialProblemTestCaseDrafts([{ input: "", expectedOutput: "", isVisible: false }])} />);

    fireEvent.change(screen.getByLabelText(/target/), { target: { value: "not-a-number" } });
    expect(screen.getByText("fnValueInvalidInt")).toBeInTheDocument();
  });

  it("re-hydrates the return field when expectedOutputsVersion bumps", () => {
    const initial = createInitialProblemTestCaseDrafts([
      { input: "[[1,2],3]", expectedOutput: "", isVisible: false },
    ]);

    function VersionHarness() {
      const [cases, setCases] = useState<ProblemTestCaseDraft[]>(initial);
      const [version, setVersion] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setCases((cur) => cur.map((c) => ({ ...c, expectedOutput: "[4,5]" })));
              setVersion((v) => v + 1);
            }}
          >
            compute
          </button>
          <FunctionTestCaseEditor
            params={params}
            returnType="int[]"
            testCases={cases}
            onChange={setCases}
            expectedOutputsVersion={version}
          />
        </>
      );
    }

    render(<VersionHarness />);
    fireEvent.click(screen.getByRole("button", { name: "compute" }));
    expect((screen.getByLabelText(/fnExpectedReturnLabel/) as HTMLInputElement).value).toBe("4, 5");
  });
});

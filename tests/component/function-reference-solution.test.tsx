import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  FunctionReferenceSolution,
  type ReferenceSolution,
} from "@/components/problem/function-reference-solution";
import { getAdapter } from "@/lib/judge/function-judging/registry";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

const { apiFetchMock, toastSuccessMock, toastErrorMock, toastWarningMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, warning: toastWarningMock },
}));

vi.mock("@/lib/api/client", () => ({
  apiFetch: apiFetchMock,
  getApiData: (payload: unknown) =>
    typeof payload === "object" && payload !== null && "data" in payload
      ? (payload as { data: unknown }).data
      : undefined,
}));

// CodeEditor dynamically imports a heavy CodeMirror surface — stub it.
vi.mock("@/components/code/code-editor", () => ({
  CodeEditor: ({
    value,
    onValueChange,
    ariaLabel,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

const spec: FunctionSpec = {
  functionName: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returnType: "int[]",
  enabledLanguages: ["python", "cpp23"],
};

function Harness({ problemId }: { problemId: string | null }) {
  const [ref, setRef] = useState<ReferenceSolution>({ language: "python", source: "" });
  const [computed, setComputed] = useState<unknown[]>([]);
  return (
    <>
      <FunctionReferenceSolution
        spec={spec}
        value={ref}
        onChange={setRef}
        problemId={problemId}
        onComputed={setComputed}
        testCaseCount={2}
      />
      <output data-testid="computed">{JSON.stringify(computed)}</output>
    </>
  );
}

describe("FunctionReferenceSolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the stub preview for the selected language", () => {
    render(<Harness problemId="p-1" />);
    const expectedStub = getAdapter("python").generateStub(spec);
    const preview = screen.getByLabelText("fnStubPreviewTitle");
    expect(preview.textContent).toBe(expectedStub);
    expect(preview.textContent).toContain("twoSum");
  });

  it("lists only the spec's enabled languages and updates the stub on change", () => {
    render(<Harness problemId="p-1" />);
    const select = screen.getByLabelText("fnReferenceLanguageLabel") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["python", "cpp23"]);

    fireEvent.change(select, { target: { value: "cpp23" } });
    const expectedCppStub = getAdapter("cpp23").generateStub(spec);
    expect(screen.getByLabelText("fnStubPreviewTitle").textContent).toBe(expectedCppStub);
  });

  it("disables compute and hints to save first when there is no problem id", () => {
    render(<Harness problemId={null} />);
    expect(screen.getByRole("button", { name: "fnComputeExpected" })).toBeDisabled();
    expect(screen.getByText("fnComputeSaveFirst")).toBeInTheDocument();
  });

  it("posts to compute-expected and forwards results when saved", async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          results: [
            { testCaseIndex: 0, expectedOutput: "[0,1]", ok: true },
            { testCaseIndex: 1, expectedOutput: "[1,2]", ok: true },
          ],
        },
      }),
    });

    render(<Harness problemId="p-1" />);
    fireEvent.click(screen.getByRole("button", { name: "fnComputeExpected" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/api/v1/problems/p-1/compute-expected",
        expect.objectContaining({ method: "POST" }),
      );
    });

    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId("computed").textContent ?? "[]")).toHaveLength(2);
    });
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});

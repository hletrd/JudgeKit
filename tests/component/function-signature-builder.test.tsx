import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { FunctionSignatureBuilder } from "@/components/problem/function-signature-builder";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

function Harness({ initial }: { initial: FunctionSpec }) {
  const [spec, setSpec] = useState<FunctionSpec>(initial);
  return (
    <>
      <FunctionSignatureBuilder value={spec} onChange={setSpec} />
      <output data-testid="spec">{JSON.stringify(spec)}</output>
    </>
  );
}

const baseSpec: FunctionSpec = {
  functionName: "",
  params: [{ name: "", type: "int" }],
  returnType: "int",
  enabledLanguages: ["python"],
};

function currentSpec(): FunctionSpec {
  return JSON.parse(screen.getByTestId("spec").textContent ?? "{}");
}

describe("FunctionSignatureBuilder", () => {
  it("emits function name, params, and return type changes", () => {
    render(<Harness initial={baseSpec} />);

    fireEvent.change(screen.getByLabelText("fnNameLabel"), { target: { value: "twoSum" } });
    expect(currentSpec().functionName).toBe("twoSum");

    fireEvent.change(screen.getByLabelText('fnParamNameLabel:{"number":1}'), {
      target: { value: "nums" },
    });
    fireEvent.change(screen.getByLabelText('fnParamTypeLabel:{"number":1}'), {
      target: { value: "int[]" },
    });
    expect(currentSpec().params[0]).toEqual({ name: "nums", type: "int[]" });

    fireEvent.change(screen.getByLabelText("fnReturnTypeLabel"), { target: { value: "int[]" } });
    expect(currentSpec().returnType).toBe("int[]");
  });

  it("adds and removes parameters", () => {
    render(<Harness initial={baseSpec} />);

    fireEvent.click(screen.getByRole("button", { name: "fnAddParam" }));
    expect(currentSpec().params).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('fnParamNameLabel:{"number":2}'), {
      target: { value: "target" },
    });
    expect(currentSpec().params[1].name).toBe("target");

    const removeButtons = screen.getAllByRole("button", { name: "fnRemoveParam" });
    fireEvent.click(removeButtons[0]);
    expect(currentSpec().params).toHaveLength(1);
    expect(currentSpec().params[0].name).toBe("target");
  });

  it("toggles enabled languages and surfaces all 7 function-judging languages", () => {
    render(<Harness initial={baseSpec} />);

    // 7 language checkboxes are rendered (python preselected).
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(7);

    // Add C++ (cpp23 -> "C++ (C++23)") and confirm it joins enabledLanguages.
    const cppLabel = screen.getByText(/C\+\+/);
    fireEvent.click(cppLabel);
    expect(currentSpec().enabledLanguages).toContain("cpp23");
    expect(currentSpec().enabledLanguages).toContain("python");
  });

  it("flags an invalid function-name identifier", () => {
    render(<Harness initial={{ ...baseSpec, functionName: "2bad" }} />);
    expect(screen.getByText("fnNameInvalid")).toBeInTheDocument();
  });
});

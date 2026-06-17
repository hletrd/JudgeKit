import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { FunctionSignatureBuilder } from "@/components/problem/function-signature-builder";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

function Harness({ initial, withTolerances }: { initial: FunctionSpec; withTolerances?: boolean }) {
  const [spec, setSpec] = useState<FunctionSpec>(initial);
  const [abs, setAbs] = useState("");
  const [rel, setRel] = useState("");
  return (
    <>
      <FunctionSignatureBuilder
        value={spec}
        onChange={setSpec}
        {...(withTolerances
          ? {
              floatAbsoluteError: abs,
              floatRelativeError: rel,
              onFloatAbsoluteErrorChange: setAbs,
              onFloatRelativeErrorChange: setRel,
            }
          : {})}
      />
      <output data-testid="spec">{JSON.stringify(spec)}</output>
      <output data-testid="abs">{abs}</output>
      <output data-testid="rel">{rel}</output>
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

  it("offers double and double[] in the parameter and return type selects", () => {
    render(<Harness initial={baseSpec} />);

    const returnSelect = screen.getByLabelText("fnReturnTypeLabel") as HTMLSelectElement;
    const returnOptions = Array.from(returnSelect.options).map((o) => o.value);
    expect(returnOptions).toContain("double");
    expect(returnOptions).toContain("double[]");

    const paramSelect = screen.getByLabelText('fnParamTypeLabel:{"number":1}') as HTMLSelectElement;
    const paramOptions = Array.from(paramSelect.options).map((o) => o.value);
    expect(paramOptions).toContain("double");
    expect(paramOptions).toContain("double[]");

    // Selecting a double return is accepted by the spec.
    fireEvent.change(returnSelect, { target: { value: "double[]" } });
    expect(currentSpec().returnType).toBe("double[]");
  });

  it("surfaces the float-comparison note + tolerance inputs only for a double return", () => {
    render(<Harness initial={baseSpec} withTolerances />);

    // Non-double return: no float note / tolerance inputs.
    expect(screen.queryByText("fnReturnFloatNote")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("fnFloatAbsoluteErrorLabel")).not.toBeInTheDocument();

    // Switch the return type to double -> note + abs/rel tolerance inputs appear.
    fireEvent.change(screen.getByLabelText("fnReturnTypeLabel"), { target: { value: "double" } });
    expect(screen.getByText("fnReturnFloatNote")).toBeInTheDocument();

    const abs = screen.getByLabelText("fnFloatAbsoluteErrorLabel") as HTMLInputElement;
    const rel = screen.getByLabelText("fnFloatRelativeErrorLabel") as HTMLInputElement;
    expect(abs.placeholder).toBe("1e-9");
    expect(rel.placeholder).toBe("1e-9");

    fireEvent.change(abs, { target: { value: "1e-3" } });
    fireEvent.change(rel, { target: { value: "1e-4" } });
    expect(screen.getByTestId("abs").textContent).toBe("1e-3");
    expect(screen.getByTestId("rel").textContent).toBe("1e-4");

    // double[] also surfaces the float note.
    fireEvent.change(screen.getByLabelText("fnReturnTypeLabel"), { target: { value: "double[]" } });
    expect(screen.getByText("fnReturnFloatNote")).toBeInTheDocument();
  });

  it("shows the float note without tolerance inputs when no tolerance handlers are bound", () => {
    render(<Harness initial={{ ...baseSpec, returnType: "double" }} />);
    expect(screen.getByText("fnReturnFloatNote")).toBeInTheDocument();
    expect(screen.queryByLabelText("fnFloatAbsoluteErrorLabel")).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";

// problem-management imports @/lib/db at module load, which throws without a
// DATABASE_URL. We only exercise the pure resolveComparisonMode helper here, so
// stub the db module (and its transitive heavy deps) to a no-op.
vi.mock("@/lib/db", () => ({
  db: {},
  execTransaction: vi.fn(),
}));

import { resolveComparisonMode } from "@/lib/problem-management";
import type { ProblemMutationInput } from "@/lib/validators/problem-management";

type CouplingInput = Pick<
  ProblemMutationInput,
  "problemType" | "comparisonMode" | "functionSpec"
>;

function spec(returnType: string): NonNullable<ProblemMutationInput["functionSpec"]> {
  return {
    functionName: "f",
    params: [{ name: "x", type: "int" }],
    returnType: returnType as never,
    enabledLanguages: ["python"],
  };
}

describe("resolveComparisonMode — float coupling for double returns", () => {
  it("forces float for a double scalar return even when author sent exact", () => {
    const input: CouplingInput = {
      problemType: "function",
      comparisonMode: "exact",
      functionSpec: spec("double"),
    };
    expect(resolveComparisonMode(input)).toBe("float");
  });

  it("forces float for a double[] return", () => {
    const input: CouplingInput = {
      problemType: "function",
      comparisonMode: "exact",
      functionSpec: spec("double[]"),
    };
    expect(resolveComparisonMode(input)).toBe("float");
  });

  it("keeps exact for an int return whose PARAM is double (only RETURN couples)", () => {
    const input: CouplingInput = {
      problemType: "function",
      comparisonMode: "exact",
      functionSpec: {
        functionName: "f",
        params: [{ name: "x", type: "double" }, { name: "y", type: "double[]" }],
        returnType: "int" as never,
        enabledLanguages: ["python"],
      },
    };
    expect(resolveComparisonMode(input)).toBe("exact");
  });

  // Server-authoritative (H1): for a FUNCTION problem the comparison mode is
  // FULLY determined by the return type, regardless of the inbound
  // comparisonMode. A stale `float` carried forward from a prior double return
  // must NOT survive a non-double return, otherwise whitespace-differing wrong
  // string answers are wrongly Accepted by the worker's float tokenizer.
  it("forces exact for a non-double function return even when the inbound mode is float (stale carry-forward)", () => {
    expect(
      resolveComparisonMode({
        problemType: "function",
        comparisonMode: "float",
        functionSpec: spec("string"),
      }),
    ).toBe("exact");
    expect(
      resolveComparisonMode({
        problemType: "function",
        comparisonMode: "float",
        functionSpec: spec("string[]"),
      }),
    ).toBe("exact");
    expect(
      resolveComparisonMode({
        problemType: "function",
        comparisonMode: "float",
        functionSpec: spec("int"),
      }),
    ).toBe("exact");
    expect(
      resolveComparisonMode({
        problemType: "function",
        comparisonMode: "exact",
        functionSpec: spec("int[]"),
      }),
    ).toBe("exact");
  });

  it("leaves non-function problems untouched (inbound mode respected)", () => {
    expect(
      resolveComparisonMode({
        problemType: "auto",
        comparisonMode: "exact",
        functionSpec: null,
      }),
    ).toBe("exact");
    expect(
      resolveComparisonMode({
        problemType: "auto",
        comparisonMode: "float",
        functionSpec: null,
      }),
    ).toBe("float");
    expect(
      resolveComparisonMode({
        problemType: "manual",
        comparisonMode: "float",
        functionSpec: null,
      }),
    ).toBe("float");
  });
});

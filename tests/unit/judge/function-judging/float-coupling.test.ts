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

  it("keeps a non-double function return at the author-chosen mode", () => {
    expect(
      resolveComparisonMode({
        problemType: "function",
        comparisonMode: "exact",
        functionSpec: spec("int[]"),
      }),
    ).toBe("exact");
    // An author who explicitly asked for float on a non-double return keeps it.
    expect(
      resolveComparisonMode({
        problemType: "function",
        comparisonMode: "float",
        functionSpec: spec("int"),
      }),
    ).toBe("float");
  });

  it("leaves non-function problems untouched", () => {
    expect(
      resolveComparisonMode({
        problemType: "auto",
        comparisonMode: "exact",
        functionSpec: null,
      }),
    ).toBe("exact");
  });
});

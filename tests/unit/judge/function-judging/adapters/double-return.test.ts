import { describe, expect, it } from "vitest";
import { getAdapter } from "@/lib/judge/function-judging/registry";
import type { FunctionSpec, FunctionType } from "@/lib/judge/function-judging/types";

/**
 * v1.1 double-return print-path guard for every adapter.
 *
 * These are static (no compile/run) checks that the assembled harness uses a
 * whitespace-token print path for `double` / `double[]` returns — NOT the JSON
 * writer (`JSON.stringify` / `json.Marshal` / the JSON `writeVal` array form) —
 * and that the stub renders double signatures. The authoritative cross-language
 * correctness check is the compile+run smoke layer (adapters-smoke.test.ts).
 */

const LANGS = ["python", "cpp23", "javascript", "typescript", "java", "go", "csharp"];

function spec(returnType: FunctionType): FunctionSpec {
  return {
    functionName: "f",
    params: [{ name: "x", type: "double" }, { name: "ys", type: "double[]" }],
    returnType,
    enabledLanguages: LANGS,
  };
}

// A correct, language-appropriate identity-ish solution that returns `x` (for
// double) or `ys` (for double[]) so the assembled source compiles in shape.
const scalarSolutions: Record<string, string> = {
  python: "class Solution:\n    def f(self, x, ys):\n        return x\n",
  cpp23: "class Solution {\npublic:\n    double f(double x, std::vector<double> ys) { return x; }\n};\n",
  javascript: "function f(x, ys) {\n  return x;\n}\n",
  typescript: "function f(x: number, ys: number[]): number {\n  return x;\n}\n",
  java: "class Solution {\n    double f(double x, double[] ys) {\n        return x;\n    }\n}\n",
  go: "func f(x float64, ys []float64) float64 {\n\treturn x\n}\n",
  csharp: "class Solution {\n    public double f(double x, double[] ys) {\n        return x;\n    }\n}\n",
};
const arraySolutions: Record<string, string> = {
  python: "class Solution:\n    def f(self, x, ys):\n        return ys\n",
  cpp23:
    "class Solution {\npublic:\n    std::vector<double> f(double x, std::vector<double> ys) { return ys; }\n};\n",
  javascript: "function f(x, ys) {\n  return ys;\n}\n",
  typescript: "function f(x: number, ys: number[]): number[] {\n  return ys;\n}\n",
  java: "class Solution {\n    double[] f(double x, double[] ys) {\n        return ys;\n    }\n}\n",
  go: "func f(x float64, ys []float64) []float64 {\n\treturn ys\n}\n",
  csharp:
    "class Solution {\n    public double[] f(double x, double[] ys) {\n        return ys;\n    }\n}\n",
};

// The token-printing signal each adapter's double-return path must contain.
const scalarSignal: Record<string, string> = {
  python: "sys.stdout.write(repr(float(result)))",
  cpp23: "__fnjudge::writeVal(__out, __result);",
  javascript: "String(__result)",
  typescript: "String(__result)",
  java: "__FnJudge.write(__out, __result);",
  go: "strconv.FormatFloat(__result, 'g', -1, 64)",
  csharp: "__FnJudge.Write(__out, __result);",
};
const arraySignal: Record<string, string> = {
  python: '" ".join(repr(float(__x)) for __x in result)',
  cpp23: "__out.push_back(' ')",
  javascript: '__result.map(String).join(" ")',
  typescript: '(__result as number[]).map(String).join(" ")',
  java: "__out.append(' ')",
  go: 'strings.Join(__tokens, " ")',
  csharp: "__out.Append(' ')",
};

describe.each(LANGS)("double-return adapter: %s", (lang) => {
  const adapter = getAdapter(lang);

  it("renders a double scalar signature in the stub", () => {
    const stub = adapter.generateStub(spec("double"));
    // The mapped scalar double type (or, for untyped languages, the param list)
    // appears in each language's stub signature.
    const doubleTypeToken: Record<string, string> = {
      python: "def f(self, x, ys)",
      javascript: "function f(x, ys)",
      typescript: "number",
      go: "float64",
      java: "double",
      cpp23: "double",
      csharp: "double",
    };
    expect(stub).toContain(doubleTypeToken[lang]);
  });

  it("prints a single numeric token (not JSON) for a double scalar return", () => {
    const { source } = adapter.assemble(spec("double"), scalarSolutions[lang]);
    expect(source).toContain(scalarSignal[lang]);
  });

  it("prints space-separated tokens (not a JSON array) for a double[] return", () => {
    const { source } = adapter.assemble(spec("double[]"), arraySolutions[lang]);
    expect(source).toContain(arraySignal[lang]);
  });
});

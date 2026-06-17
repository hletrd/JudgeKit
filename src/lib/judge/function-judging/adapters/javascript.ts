import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec, FunctionType } from "../types";

// Prelude is empty: the student's top-level function declaration is hoisted, so
// the appended harness can call it directly. Kept as a constant so the line
// count stays explicit and consistent with the other adapters.
const PRELUDE = "";

// double / double[] returns print whitespace-separated numeric tokens (a single
// token for a scalar, space-joined for an array) to match encodeValue's
// float/space-separated contract — the worker's whitespace-token float
// comparator tokenizes these but cannot tokenize a JSON `[a,b]`. `String()` is
// JS's shortest round-trip number form, fine under tolerance-based comparison.
function printExpr(returnType: FunctionType): string {
  if (returnType === "double") return "String(__result)";
  if (returnType === "double[]") return "__result.map(String).join(\" \")";
  return "JSON.stringify(__result)";
}

const MAIN = (fn: string, returnType: FunctionType) => `

const __input = require("fs").readFileSync(0, "utf8");
const __args = JSON.parse(__input.split("\\n")[0]);
const __result = ${fn}(...__args);
process.stdout.write(${printExpr(returnType)});
`;

export const javascriptAdapter: FunctionHarnessAdapter = {
  language: "javascript",
  generateStub(spec: FunctionSpec): string {
    const params = spec.params.map((p) => p.name).join(", ");
    return `function ${spec.functionName}(${params}) {\n  // TODO: implement\n}\n`;
  },
  assemble(spec: FunctionSpec, studentCode: string) {
    // The prelude is empty, so the student code starts at line 0.
    const preludeLineCount = 0;
    const source = `${PRELUDE}${studentCode}${MAIN(spec.functionName, spec.returnType)}`;
    return { source, preludeLineCount };
  },
};

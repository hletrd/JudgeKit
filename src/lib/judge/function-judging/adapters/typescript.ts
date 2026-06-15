import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec, FunctionType } from "../types";
import { isArrayType, elementType } from "../types";

/** Map a FunctionType to its TypeScript declaration type. */
function tsType(t: FunctionType): string {
  if (isArrayType(t)) return `${tsScalar(elementType(t))}[]`;
  return tsScalar(t);
}

function tsScalar(t: string): string {
  switch (t) {
    case "int":
    case "long":
    case "double":
      return "number";
    case "bool":
      return "boolean";
    case "string":
      return "string";
    default:
      throw new Error(`unsupported scalar ${t}`);
  }
}

// Prelude is empty: the student's top-level function declaration is hoisted, so
// the appended harness can call it directly. Kept as a constant so the line
// count stays explicit and consistent with the other adapters.
const PRELUDE = "";

// The harness compiles under `tsc --strict`. `require` comes from @types/node;
// the parsed args are typed `unknown[]` and the call is cast so the spread is
// accepted regardless of the student function's parameter types.
const MAIN = (fn: string) => `

const __input: string = require("fs").readFileSync(0, "utf8");
const __args: unknown[] = JSON.parse(__input.split("\\n")[0]);
const __result = (${fn} as (...args: unknown[]) => unknown)(...__args);
process.stdout.write(JSON.stringify(__result));
`;

export const typescriptAdapter: FunctionHarnessAdapter = {
  language: "typescript",
  generateStub(spec: FunctionSpec): string {
    const params = spec.params.map((p) => `${p.name}: ${tsType(p.type)}`).join(", ");
    const ret = tsType(spec.returnType);
    return `function ${spec.functionName}(${params}): ${ret} {\n  // TODO: implement\n}\n`;
  },
  assemble(spec: FunctionSpec, studentCode: string) {
    // The prelude is empty, so the student code starts at line 0.
    const preludeLineCount = 0;
    const source = `${PRELUDE}${studentCode}${MAIN(spec.functionName)}`;
    return { source, preludeLineCount };
  },
};

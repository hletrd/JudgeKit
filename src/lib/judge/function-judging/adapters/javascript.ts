import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec } from "../types";

// Prelude is empty: the student's top-level function declaration is hoisted, so
// the appended harness can call it directly. Kept as a constant so the line
// count stays explicit and consistent with the other adapters.
const PRELUDE = "";

const MAIN = (fn: string) => `

const __input = require("fs").readFileSync(0, "utf8");
const __args = JSON.parse(__input.split("\\n")[0]);
const __result = ${fn}(...__args);
process.stdout.write(JSON.stringify(__result));
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
    const source = `${PRELUDE}${studentCode}${MAIN(spec.functionName)}`;
    return { source, preludeLineCount };
  },
};

import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec, FunctionType } from "../types";

const PRELUDE = `import sys, json
`;

// ensure_ascii=False keeps non-ASCII characters raw (UTF-8), matching the
// canonical JSON.stringify contract in serialization.ts and every other
// adapter. The default ensure_ascii=True would escape non-ASCII to \uXXXX and
// produce a byte-divergent expected/actual for string returns judged
// cross-language. separators stay compact (no inner spaces) like encodeValue.
//
// double / double[] returns instead print whitespace-separated numeric tokens
// (one token for a scalar, space-joined for an array) to match encodeValue's
// float/space-separated contract — the worker's whitespace-token float
// comparator tokenizes these, where it cannot tokenize a JSON `[a,b]`. `repr`
// gives Python's shortest round-trip form for a float, which is fine since
// float comparison is tolerance-based (need not byte-match other languages).
function printStmt(returnType: FunctionType): string {
  if (returnType === "double") {
    return `sys.stdout.write(repr(float(result)))`;
  }
  if (returnType === "double[]") {
    return `sys.stdout.write(" ".join(repr(float(__x)) for __x in result))`;
  }
  return `sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))`;
}

const MAIN = (fn: string, returnType: FunctionType) => `

def _main():
    args = json.loads(sys.stdin.readline())
    result = Solution().${fn}(*args)
    ${printStmt(returnType)}

if __name__ == "__main__":
    _main()
`;

export const pythonAdapter: FunctionHarnessAdapter = {
  language: "python",
  generateStub(spec: FunctionSpec): string {
    const params = ["self", ...spec.params.map((p) => p.name)].join(", ");
    return `class Solution:\n    def ${spec.functionName}(${params}):\n        pass\n`;
  },
  assemble(spec: FunctionSpec, studentCode: string) {
    const preludeLineCount = PRELUDE.split("\n").length - 1; // lines before student code
    const source = `${PRELUDE}${studentCode}${MAIN(spec.functionName, spec.returnType)}`;
    return { source, preludeLineCount };
  },
};

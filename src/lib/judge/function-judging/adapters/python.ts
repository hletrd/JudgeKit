import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec } from "../types";

const PRELUDE = `import sys, json
`;

// ensure_ascii=False keeps non-ASCII characters raw (UTF-8), matching the
// canonical JSON.stringify contract in serialization.ts and every other
// adapter. The default ensure_ascii=True would escape non-ASCII to \uXXXX and
// produce a byte-divergent expected/actual for string returns judged
// cross-language. separators stay compact (no inner spaces) like encodeValue.
const MAIN = (fn: string) => `

def _main():
    args = json.loads(sys.stdin.readline())
    result = Solution().${fn}(*args)
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))

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
    const source = `${PRELUDE}${studentCode}${MAIN(spec.functionName)}`;
    return { source, preludeLineCount };
  },
};

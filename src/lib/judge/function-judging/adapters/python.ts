import type { FunctionHarnessAdapter } from "../adapter";
import type { FunctionSpec } from "../types";

const PRELUDE = `import sys, json
`;

const MAIN = (fn: string) => `

def _main():
    args = json.loads(sys.stdin.readline())
    result = Solution().${fn}(*args)
    sys.stdout.write(json.dumps(result, separators=(",", ":")))

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

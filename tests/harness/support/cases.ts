import type { FunctionSpec, FunctionType } from "@/lib/judge/function-judging/types";

/**
 * A single compile+run smoke case: a FunctionSpec, a correct student solution
 * per language, the call arguments, and the expected return value. The runner
 * feeds `encodeArgs(args, spec.params)` on stdin and asserts stdout equals
 * `encodeValue(expectedReturn, spec.returnType)` byte-for-byte.
 */
export interface SmokeCase {
  name: string;
  spec: FunctionSpec;
  args: unknown[];
  expectedReturn: unknown;
  /** Correct student source per language id (registry id, C++ = `cpp23`). */
  solutions: Record<string, string>;
  /**
   * When true the runner compares the program stdout to `encodeValue` with
   * FLOAT tolerance (parse both as whitespace-separated f64 tokens; equal token
   * count; each token within 1e-9 abs OR rel) instead of byte-identity. Set for
   * `double`/`double[]` returns, where per-language textual forms legitimately
   * diverge (`0.5` vs `0.500000000`) but are judged within tolerance.
   */
  float?: boolean;
}

function spec(
  functionName: string,
  params: { name: string; type: FunctionType }[],
  returnType: FunctionType,
): FunctionSpec {
  return {
    functionName,
    params,
    returnType,
    enabledLanguages: ["python", "cpp23", "javascript", "typescript", "java", "go", "csharp"],
  };
}

// An `echo(string) -> string` identity returns its argument unchanged. Pairing
// it with adversarial string inputs (quote, backslash, comma, newline,
// non-ASCII) exercises both the harness's stdin JSON DECODER and its stdout
// ENCODER end to end: the program must parse the escaped input, hold the real
// runtime string, then re-encode it to the canonical JSON.stringify form. This
// is exactly the path the two shipped bugs corrupted (Java never compiled; C#
// mangled non-ASCII under POSIX locale).
const ECHO = spec("echo", [{ name: "s", type: "string" }], "string");
const echoSolutions: Record<string, string> = {
  python: "class Solution:\n    def echo(self, s):\n        return s\n",
  cpp23: "class Solution {\npublic:\n    std::string echo(std::string s) { return s; }\n};\n",
  javascript: "function echo(s) {\n  return s;\n}\n",
  typescript: "function echo(s: string): string {\n  return s;\n}\n",
  java: "class Solution {\n    String echo(String s) {\n        return s;\n    }\n}\n",
  go: "func echo(s string) string {\n\treturn s\n}\n",
  csharp: "class Solution {\n    public string echo(string s) {\n        return s;\n    }\n}\n",
};

function echoCase(name: string, value: string): SmokeCase {
  return { name, spec: ECHO, args: [value], expectedReturn: value, solutions: echoSolutions };
}

// echoArr(string[]) -> string[] identity, same idea for array-of-string with
// embedded comma + quote (tests element-boundary + per-element escaping).
const ECHO_ARR = spec("echoArr", [{ name: "xs", type: "string[]" }], "string[]");
const echoArrSolutions: Record<string, string> = {
  python: "class Solution:\n    def echoArr(self, xs):\n        return xs\n",
  cpp23:
    "class Solution {\npublic:\n    std::vector<std::string> echoArr(std::vector<std::string> xs) { return xs; }\n};\n",
  javascript: "function echoArr(xs) {\n  return xs;\n}\n",
  typescript: "function echoArr(xs: string[]): string[] {\n  return xs;\n}\n",
  java: "class Solution {\n    String[] echoArr(String[] xs) {\n        return xs;\n    }\n}\n",
  go: "func echoArr(xs []string) []string {\n\treturn xs\n}\n",
  csharp:
    "class Solution {\n    public string[] echoArr(string[] xs) {\n        return xs;\n    }\n}\n",
};

// twoSum(int[], int) -> int[]: a non-string regression guard. A numeric path
// that breaks (wrong int width, array brackets) is caught independently of the
// string cases.
const TWO_SUM = spec(
  "twoSum",
  [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
  "int[]",
);
const twoSumSolutions: Record<string, string> = {
  python:
    "class Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n        for i, x in enumerate(nums):\n            if target - x in seen:\n                return [seen[target - x], i]\n            seen[x] = i\n        return []\n",
  cpp23:
    "class Solution {\npublic:\n    std::vector<long long> twoSum(std::vector<long long> nums, long long target) {\n        std::unordered_map<long long, long long> seen;\n        for (long long i = 0; i < (long long) nums.size(); i++) {\n            auto it = seen.find(target - nums[i]);\n            if (it != seen.end()) return {it->second, i};\n            seen[nums[i]] = i;\n        }\n        return {};\n    }\n};\n",
  javascript:
    "function twoSum(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\n",
  typescript:
    "function twoSum(nums: number[], target: number): number[] {\n  const seen = new Map<number, number>();\n  for (let i = 0; i < nums.length; i++) {\n    if (seen.has(target - nums[i])) return [seen.get(target - nums[i])!, i];\n    seen.set(nums[i], i);\n  }\n  return [];\n}\n",
  java:
    "class Solution {\n    long[] twoSum(long[] nums, long target) {\n        Map<Long, Long> seen = new HashMap<>();\n        for (long i = 0; i < nums.length; i++) {\n            if (seen.containsKey(target - nums[(int) i])) return new long[]{seen.get(target - nums[(int) i]), i};\n            seen.put(nums[(int) i], i);\n        }\n        return new long[]{};\n    }\n}\n",
  go:
    "func twoSum(nums []int64, target int64) []int64 {\n\tseen := map[int64]int64{}\n\tfor i, x := range nums {\n\t\tif j, ok := seen[target-x]; ok {\n\t\t\treturn []int64{j, int64(i)}\n\t\t}\n\t\tseen[x] = int64(i)\n\t}\n\treturn []int64{}\n}\n",
  csharp:
    "class Solution {\n    public long[] twoSum(long[] nums, long target) {\n        var seen = new Dictionary<long, long>();\n        for (long i = 0; i < nums.Length; i++) {\n            if (seen.ContainsKey(target - nums[i])) return new long[]{seen[target - nums[i]], i};\n            seen[nums[i]] = i;\n        }\n        return new long[]{};\n    }\n}\n",
};

// identDouble(double) -> double identity: exercises the scalar double RETURN
// print path (single numeric token) end to end. The expected output is the
// `encodeValue` token; the runner compares with float tolerance so each
// language's textual form (0.5 vs 0.500000000) is fine.
const IDENT_DOUBLE = spec("identDouble", [{ name: "x", type: "double" }], "double");
const identDoubleSolutions: Record<string, string> = {
  python: "class Solution:\n    def identDouble(self, x):\n        return x\n",
  cpp23: "class Solution {\npublic:\n    double identDouble(double x) { return x; }\n};\n",
  javascript: "function identDouble(x) {\n  return x;\n}\n",
  typescript: "function identDouble(x: number): number {\n  return x;\n}\n",
  java: "class Solution {\n    double identDouble(double x) {\n        return x;\n    }\n}\n",
  go: "func identDouble(x float64) float64 {\n\treturn x\n}\n",
  csharp: "class Solution {\n    public double identDouble(double x) {\n        return x;\n    }\n}\n",
};
function doubleCase(name: string, value: number): SmokeCase {
  return {
    name,
    spec: IDENT_DOUBLE,
    args: [value],
    expectedReturn: value,
    solutions: identDoubleSolutions,
    float: true,
  };
}

// identDoubleArr(double[]) -> double[] identity: exercises the double[] RETURN
// print path (space-separated numeric tokens, NOT a JSON array).
const IDENT_DOUBLE_ARR = spec("identDoubleArr", [{ name: "xs", type: "double[]" }], "double[]");
const identDoubleArrSolutions: Record<string, string> = {
  python: "class Solution:\n    def identDoubleArr(self, xs):\n        return xs\n",
  cpp23:
    "class Solution {\npublic:\n    std::vector<double> identDoubleArr(std::vector<double> xs) { return xs; }\n};\n",
  javascript: "function identDoubleArr(xs) {\n  return xs;\n}\n",
  typescript: "function identDoubleArr(xs: number[]): number[] {\n  return xs;\n}\n",
  java: "class Solution {\n    double[] identDoubleArr(double[] xs) {\n        return xs;\n    }\n}\n",
  go: "func identDoubleArr(xs []float64) []float64 {\n\treturn xs\n}\n",
  csharp:
    "class Solution {\n    public double[] identDoubleArr(double[] xs) {\n        return xs;\n    }\n}\n",
};

/**
 * The canonical smoke matrix. Every language runs every case; the runner skips
 * a (language, case) only if the language has no solution entry (none do today).
 */
export const SMOKE_CASES: SmokeCase[] = [
  echoCase("string: plain", "hello"),
  echoCase('string: with double-quote "', 'a"b'),
  echoCase("string: with backslash \\", "a\\b"),
  echoCase("string: with comma ,", "a,b"),
  echoCase("string: with newline (must stay one line)", "line1\nline2"),
  echoCase("string: non-ASCII café→", "café→"),
  echoCase("string: non-ASCII 한국어", "한국어"),
  {
    name: 'string[]: ["a,b","c\\"d"]',
    spec: ECHO_ARR,
    args: [["a,b", 'c"d']],
    expectedReturn: ["a,b", 'c"d'],
    solutions: echoArrSolutions,
  },
  {
    name: "int[]: twoSum numeric sanity",
    spec: TWO_SUM,
    args: [[2, 7, 11, 15], 9],
    expectedReturn: [0, 1],
    solutions: twoSumSolutions,
  },
  // double scalar RETURN coverage (float-tolerance comparison).
  doubleCase("double: plain 0.5", 0.5),
  doubleCase("double: negative -3.25", -3.25),
  doubleCase("double: small 1e-7", 1e-7),
  doubleCase("double: integral-valued 7.0", 7.0),
  // double[] RETURN coverage: mixed plain/negative/small/integral, printed as
  // space-separated tokens (must NOT be a JSON array).
  {
    name: "double[]: [0.5, -3.25, 1e-7, 7.0]",
    spec: IDENT_DOUBLE_ARR,
    args: [[0.5, -3.25, 1e-7, 7.0]],
    expectedReturn: [0.5, -3.25, 1e-7, 7.0],
    solutions: identDoubleArrSolutions,
    float: true,
  },
];

# Function-Signature Judging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `function` problem type where the author defines a function signature + typed I/O examples and the student implements only the function, judged by compiling a generated harness down to the existing stdin/stdout pipeline.

**Architecture:** A function submission is transpiled at judge-claim time into an ordinary stdin/stdout submission: the app assembles `prelude + studentCode + generatedMain` and sends it to the **unchanged** Rust worker as `sourceCode`; test cases store serialized args (`input`) / serialized return (`expectedOutput`); the existing comparator checks stdout. New work is a per-language harness registry, a typed authoring UI, and a generated student stub. See spec: `docs/superpowers/specs/2026-06-14-function-judging-design.md`.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Drizzle ORM + PostgreSQL, vitest, the Rust judge worker (`judge-worker-rs`, NOT modified), next-intl (en/ko).

---

## File Structure

**New:**
- `src/lib/judge/function-judging/types.ts` — `FunctionType`, `FunctionSpec`, `SUPPORTED_FUNCTION_TYPES`.
- `src/lib/judge/function-judging/serialization.ts` — canonical encode/decode of args & return values.
- `src/lib/judge/function-judging/adapter.ts` — `FunctionHarnessAdapter` interface + shared helpers.
- `src/lib/judge/function-judging/registry.ts` — `getAdapter`, `supportsFunctionJudging`, `FUNCTION_JUDGING_LANGUAGES`.
- `src/lib/judge/function-judging/adapters/{python,cpp,javascript,typescript,java,go,csharp}.ts` — one harness adapter each.
- `src/lib/judge/function-judging/assemble.ts` — `assembleFunctionSubmission(spec, language, userCode)`.
- `tests/unit/judge/function-judging/*.test.ts` — unit + golden tests.
- `tests/unit/judge/function-judging/golden/*` — golden assembled-source fixtures.
- `src/components/problem/function-signature-builder.tsx` — author signature editor.
- `src/components/problem/function-test-case-editor.tsx` — typed per-param case editor.
- `tests/e2e/function-judging.spec.ts` — end-to-end.

**Modified:**
- `src/lib/db/schema.pg.ts` — add `functionSpec`, `referenceSolution` to `problems`.
- `drizzle/pg/*` — generated migration + journal.
- `src/lib/validators/problem-management.ts` — accept/validate `functionSpec` + `referenceSolution`.
- `src/lib/problem-management.ts` — persist/read the new fields.
- `src/app/api/v1/problems/route.ts`, `src/app/api/v1/problems/[id]/route.ts` — pass the new fields through.
- `src/app/api/v1/problems/[id]/compute-expected/route.ts` — NEW reference-compute endpoint (create dir).
- `src/app/api/v1/judge/claim/route.ts` — wrap function submissions (the seam, ~L329–347).
- `src/lib/judge/code-templates.ts` — function-problem stubs come from the adapter, not `DEFAULT_TEMPLATES`.
- `src/app/(public)/problems/create/create-problem-form.tsx` + `.../[id]/edit/page.tsx` — function authoring UI.
- The student submit editor component (problem detail) — preload stub, gate languages.
- `messages/en.json`, `messages/ko.json` — new strings.

---

## Phase A — Foundation: types, serialization, data model

### Task 1: FunctionType + FunctionSpec types and validator

**Files:**
- Create: `src/lib/judge/function-judging/types.ts`
- Test: `tests/unit/judge/function-judging/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { isFunctionType, parseFunctionSpec, SUPPORTED_FUNCTION_TYPES } from "@/lib/judge/function-judging/types";

describe("function-judging types", () => {
  it("accepts every supported scalar and 1-D array type", () => {
    for (const t of SUPPORTED_FUNCTION_TYPES) expect(isFunctionType(t)).toBe(true);
    expect(SUPPORTED_FUNCTION_TYPES).toContain("int");
    expect(SUPPORTED_FUNCTION_TYPES).toContain("string[]");
  });

  it("rejects unsupported types", () => {
    expect(isFunctionType("int[][]")).toBe(false);
    expect(isFunctionType("map")).toBe(false);
    expect(isFunctionType("void")).toBe(false); // non-void return required in v1
  });

  it("parses a valid spec", () => {
    const spec = parseFunctionSpec({
      functionName: "twoSum",
      params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }],
      returnType: "int[]",
      enabledLanguages: ["python", "cpp"],
    });
    expect(spec.functionName).toBe("twoSum");
    expect(spec.params).toHaveLength(2);
  });

  it("rejects a spec with an invalid identifier or zero params", () => {
    expect(() => parseFunctionSpec({ functionName: "2bad", params: [{ name: "x", type: "int" }], returnType: "int", enabledLanguages: ["python"] })).toThrow();
    expect(() => parseFunctionSpec({ functionName: "f", params: [], returnType: "int", enabledLanguages: ["python"] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/judge/function-judging/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/judge/function-judging/types.ts
import { z } from "zod";

export const SCALAR_TYPES = ["int", "long", "double", "bool", "string"] as const;
export const SUPPORTED_FUNCTION_TYPES = [
  ...SCALAR_TYPES,
  ...SCALAR_TYPES.map((t) => `${t}[]` as const),
] as const;

export type FunctionType = (typeof SUPPORTED_FUNCTION_TYPES)[number];

export function isFunctionType(value: string): value is FunctionType {
  return (SUPPORTED_FUNCTION_TYPES as readonly string[]).includes(value);
}

export function isArrayType(t: FunctionType): boolean {
  return t.endsWith("[]");
}
export function elementType(t: FunctionType): (typeof SCALAR_TYPES)[number] {
  return t.replace("[]", "") as (typeof SCALAR_TYPES)[number];
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const functionTypeSchema = z.string().refine(isFunctionType, "unsupported type");

export const functionSpecSchema = z.object({
  functionName: z.string().regex(IDENTIFIER, "invalid function name"),
  params: z.array(z.object({
    name: z.string().regex(IDENTIFIER, "invalid parameter name"),
    type: functionTypeSchema,
  })).min(1, "at least one parameter required"),
  // v1: non-void return only (void/in-place deferred to v1.1).
  returnType: functionTypeSchema,
  enabledLanguages: z.array(z.string()).min(1),
});

export type FunctionSpec = z.infer<typeof functionSpecSchema>;

export function parseFunctionSpec(value: unknown): FunctionSpec {
  return functionSpecSchema.parse(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/judge/function-judging/types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/judge/function-judging/types.ts tests/unit/judge/function-judging/types.test.ts
git commit -S -m "feat(judge): ✨ function-judging type system + spec validator"
```

---

### Task 2: Canonical serialization

**Files:**
- Create: `src/lib/judge/function-judging/serialization.ts`
- Test: `tests/unit/judge/function-judging/serialization.test.ts`

Canonical encoding rules (must match every adapter's stdout): args are a JSON array (one line) in `params` order; a single value is encoded as compact JSON — `int`/`long` as integer literal, `double` via `Number`’s shortest round-trip form, `bool` as `true`/`false`, `string` as a JSON-quoted string, arrays as `[a,b,c]` with NO inner spaces. The return is encoded the same way on its own line.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { encodeValue, encodeArgs, decodeValue } from "@/lib/judge/function-judging/serialization";

describe("function-judging serialization", () => {
  it("encodes scalars compactly", () => {
    expect(encodeValue(5, "int")).toBe("5");
    expect(encodeValue(true, "bool")).toBe("true");
    expect(encodeValue("a,b", "string")).toBe('"a,b"');
  });
  it("encodes 1-D arrays without inner spaces", () => {
    expect(encodeValue([2, 7, 11], "int[]")).toBe("[2,7,11]");
    expect(encodeValue(["x", "y"], "string[]")).toBe('["x","y"]');
  });
  it("encodes an argument vector as one JSON line", () => {
    expect(encodeArgs([[2, 7, 11, 15], 9], [
      { name: "nums", type: "int[]" }, { name: "target", type: "int" },
    ])).toBe("[[2,7,11,15],9]");
  });
  it("round-trips through decode", () => {
    expect(decodeValue("[1,2,3]", "int[]")).toEqual([1, 2, 3]);
    expect(decodeValue("true", "bool")).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/judge/function-judging/serialization.test.ts` → FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/judge/function-judging/serialization.ts
import type { FunctionType } from "./types";
import { isArrayType, elementType } from "./types";

function encodeScalar(v: unknown, t: string): string {
  switch (t) {
    case "int": case "long": return String(Math.trunc(Number(v)));
    case "double": return String(Number(v)); // shortest round-trip form
    case "bool": return v ? "true" : "false";
    case "string": return JSON.stringify(String(v));
    default: throw new Error(`unsupported scalar ${t}`);
  }
}

export function encodeValue(v: unknown, t: FunctionType): string {
  if (!isArrayType(t)) return encodeScalar(v, t);
  const el = elementType(t);
  const items = (v as unknown[]).map((x) => encodeScalar(x, el));
  return `[${items.join(",")}]`;
}

export function encodeArgs(args: unknown[], params: { name: string; type: FunctionType }[]): string {
  return `[${params.map((p, i) => encodeValue(args[i], p.type)).join(",")}]`;
}

export function decodeValue(s: string, t: FunctionType): unknown {
  const parsed = JSON.parse(s);
  return parsed;
}
```

- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/judge/function-judging/serialization.ts tests/unit/judge/function-judging/serialization.test.ts
git commit -S -m "feat(judge): ✨ canonical (de)serialization for function-judging I/O"
```

---

### Task 3: Database migration — functionSpec + referenceSolution

**Files:**
- Modify: `src/lib/db/schema.pg.ts:250-286` (the `problems` table)
- Generate: `drizzle/pg/<NNNN>_*.sql` + journal entry

- [ ] **Step 1: Add the columns to the schema**

In `problems` (after `comparisonMode`/`floatRelativeError` block, before `difficulty`):

```ts
    // Function-signature judging (problemType === "function"). Null for auto/manual.
    functionSpec: jsonb("function_spec").$type<import("@/lib/judge/function-judging/types").FunctionSpec>(),
    // Author-only reference solution; never sent to students.
    referenceSolution: jsonb("reference_solution").$type<{ language: string; source: string }>(),
```

(Confirm `jsonb` is imported at the top of `schema.pg.ts`; it is already used by other tables.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/pg/<NNNN>_*.sql` adding two nullable `jsonb` columns + a journal update.

- [ ] **Step 3: Verify migration drift guard passes**

Run: `npm run db:check`
Expected: no drift (the new migration is journaled).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.pg.ts drizzle/
git commit -S -m "feat(db): ✨ add problems.function_spec + reference_solution (nullable)"
```

---

## Phase B — Harness registry + adapters

### Task 4: Adapter interface + registry

**Files:**
- Create: `src/lib/judge/function-judging/adapter.ts`, `src/lib/judge/function-judging/registry.ts`
- Test: `tests/unit/judge/function-judging/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getAdapter, supportsFunctionJudging, FUNCTION_JUDGING_LANGUAGES } from "@/lib/judge/function-judging/registry";

describe("function-judging registry", () => {
  it("registers all 7 v1 languages", () => {
    expect([...FUNCTION_JUDGING_LANGUAGES].sort()).toEqual(
      ["cpp", "csharp", "go", "java", "javascript", "python", "typescript"].sort(),
    );
  });
  it("supportsFunctionJudging gates by registry", () => {
    expect(supportsFunctionJudging("python")).toBe(true);
    expect(supportsFunctionJudging("brainfuck")).toBe(false);
  });
  it("getAdapter returns an adapter exposing generateStub + assemble", () => {
    const a = getAdapter("python");
    expect(typeof a.generateStub).toBe("function");
    expect(typeof a.assemble).toBe("function");
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Write the interface + registry** (adapters wired in Tasks 5–11)

```ts
// src/lib/judge/function-judging/adapter.ts
import type { FunctionSpec } from "./types";

export interface FunctionHarnessAdapter {
  language: string;
  /** Student-facing starter stub (signature + empty body). */
  generateStub(spec: FunctionSpec): string;
  /** Full compile unit: prelude + studentCode + generated main. */
  assemble(spec: FunctionSpec, studentCode: string): { source: string; preludeLineCount: number };
}
```

```ts
// src/lib/judge/function-judging/registry.ts
import type { FunctionHarnessAdapter } from "./adapter";
import { pythonAdapter } from "./adapters/python";
import { cppAdapter } from "./adapters/cpp";
import { javascriptAdapter } from "./adapters/javascript";
import { typescriptAdapter } from "./adapters/typescript";
import { javaAdapter } from "./adapters/java";
import { goAdapter } from "./adapters/go";
import { csharpAdapter } from "./adapters/csharp";

const ADAPTERS: Record<string, FunctionHarnessAdapter> = {
  python: pythonAdapter,
  cpp: cppAdapter,
  javascript: javascriptAdapter,
  typescript: typescriptAdapter,
  java: javaAdapter,
  go: goAdapter,
  csharp: csharpAdapter,
};

export const FUNCTION_JUDGING_LANGUAGES = new Set(Object.keys(ADAPTERS));

export function supportsFunctionJudging(language: string): boolean {
  return FUNCTION_JUDGING_LANGUAGES.has(language);
}

export function getAdapter(language: string): FunctionHarnessAdapter {
  const a = ADAPTERS[language];
  if (!a) throw new Error(`no function-judging adapter for ${language}`);
  return a;
}
```

NOTE: this file imports the seven adapters; create them in Tasks 5–11 before running the test. Implement Task 5 first, stub the other six as `export const X: FunctionHarnessAdapter = { language, generateStub: () => "", assemble: () => ({source:"",preludeLineCount:0}) }` temporarily so the registry compiles, then flesh each out in its own task.

- [ ] **Step 4: Run** → PASS once adapters exist.
- [ ] **Step 5: Commit**

```bash
git add src/lib/judge/function-judging/adapter.ts src/lib/judge/function-judging/registry.ts tests/unit/judge/function-judging/registry.test.ts
git commit -S -m "feat(judge): ✨ function-harness adapter interface + language registry"
```

---

### Task 5: Python adapter (template — implement first, fully)

**Files:**
- Create: `src/lib/judge/function-judging/adapters/python.ts`
- Test: `tests/unit/judge/function-judging/adapters/python.test.ts`
- Golden: `tests/unit/judge/function-judging/golden/python-twoSum.py`

The Python harness reads one JSON line from stdin (the args array), passes positional args to `Solution().<fn>(...)`, prints the return via a canonical encoder that matches `serialization.ts` (compact JSON, `json.dumps(x, separators=(",", ":"))`, booleans lowercased by json, strings quoted).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { pythonAdapter } from "@/lib/judge/function-judging/adapters/python";

const spec = {
  functionName: "twoSum",
  params: [{ name: "nums", type: "int[]" as const }, { name: "target", type: "int" as const }],
  returnType: "int[]" as const,
  enabledLanguages: ["python"],
};

describe("python adapter", () => {
  it("generates a class-based stub with the right signature", () => {
    const stub = pythonAdapter.generateStub(spec);
    expect(stub).toContain("class Solution:");
    expect(stub).toContain("def twoSum(self, nums, target):");
    expect(stub).toContain("pass");
  });
  it("assemble wraps student code with a stdin-reading main and reports prelude lines", () => {
    const { source, preludeLineCount } = pythonAdapter.assemble(spec, "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n");
    expect(source).toContain("import sys, json");
    expect(source).toContain("Solution().twoSum(*args)");
    expect(preludeLineCount).toBeGreaterThan(0);
    // student code appears after exactly preludeLineCount prelude lines
    const lines = source.split("\n");
    expect(lines[preludeLineCount]).toContain("class Solution:");
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement the Python adapter**

```ts
// src/lib/judge/function-judging/adapters/python.ts
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
```

- [ ] **Step 4: Write the golden fixture** `tests/unit/judge/function-judging/golden/python-twoSum.py` = the exact `assemble(spec, correctTwoSum).source`, and assert equality in the test (regenerate intentionally on change).

- [ ] **Step 5: Run** → PASS. **Step 6: Commit**

```bash
git add src/lib/judge/function-judging/adapters/python.ts tests/unit/judge/function-judging/adapters/python.test.ts tests/unit/judge/function-judging/golden/python-twoSum.py
git commit -S -m "feat(judge): ✨ Python function-harness adapter"
```

---

### Task 6: C++ adapter (full)

**Files:** Create `adapters/cpp.ts`; Test `adapters/cpp.test.ts`; Golden `golden/cpp-twoSum.cpp`.

Type map: `int→long long`, `long→long long`, `double→double`, `bool→bool`, `string→std::string`, `T[]→std::vector<T>`. Prelude provides a tiny JSON reader for the supported types (parse one line into typed args) and a canonical writer (`[a,b,c]`, strings quoted, `true`/`false`, doubles via `printf("%.10g")` matching float-tolerant comparison). Stub = a `Solution` class with the method signature + empty body. `main` reads stdin, deserializes args, calls `Solution().fn(args...)`, prints the return.

- [ ] **Step 1: failing test** — assert stub contains `class Solution` + the mapped signature `vector<long long> twoSum(vector<long long> nums, long long target)`, and `assemble` source contains the json-read prelude + `Solution().twoSum(` call + correct `preludeLineCount`.
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement `cppAdapter`** with the prelude described above (full code: a `read_json_array`/`read_scalar` set over `std::cin`, the type-map helper, and a `to_json` overload set). Keep the prelude self-contained, no external libs (use `<bits/stdc++.h>` consistent with `code-templates.ts`).
- [ ] **Step 4: golden fixture + assert. Step 5: run → PASS. Step 6: commit** `feat(judge): ✨ C++ function-harness adapter`.

---

### Tasks 7–11: JavaScript, TypeScript, Java, Go, C# adapters

Each follows the Task 5/6 template (failing test → implement → golden fixture → pass → commit). Per-language specifics:

- [ ] **Task 7 — JavaScript** (`adapters/javascript.ts`): stub = `function twoSum(nums, target) {\n  // ...\n}\nmodule.exports = { twoSum };` (or a top-level fn the harness can reach). Harness `main`: `const args = JSON.parse(require("fs").readFileSync(0, "utf8").split("\\n")[0]); process.stdout.write(JSON.stringify(twoSum(...args)));`. Booleans/strings/arrays already canonical via `JSON.stringify` (no spaces). Commit `feat(judge): ✨ JavaScript function-harness adapter`.

- [ ] **Task 8 — TypeScript** (`adapters/typescript.ts`): same as JS but typed stub (`function twoSum(nums: number[], target: number): number[]`), type map `int/long/double→number`, `bool→boolean`, `string→string`, `T[]→T_ts[]`. Assembled source compiled via the existing TS language config. Commit.

- [ ] **Task 9 — Java** (`adapters/java.ts`): public class must be the entry the worker compiles (match the Java language config's expected class name, e.g. `Main`); generate `class Solution { <ret> twoSum(...) {} }` + a `Main` with `main` that reads stdin, parses with a minimal JSON reader (hand-written, no Gson), calls `new Solution().twoSum(...)`, prints canonical. Type map `int→long`, `double→double`, `bool→boolean`, `string→String`, `T[]→` boxed `List<T>` or arrays (pick arrays: `long[]`, `String[]`). Commit.

- [ ] **Task 10 — Go** (`adapters/go.ts`): `package main`; stub `func twoSum(nums []int64, target int64) []int64 { return nil }`; harness `main` uses `encoding/json` to read the args line into `json.RawMessage`s then typed values, calls `twoSum`, prints `json.Marshal` (compact, no spaces). Type map `int/long→int64`, `double→float64`, `bool→bool`, `string→string`, `T[]→[]T`. Commit.

- [ ] **Task 11 — C#** (`adapters/csharp.ts`): `class Solution { public <ret> twoSum(...){} }` + top-level `Main` reading stdin, `System.Text.Json` parse, call, compact serialize. Type map `int→long`, `double→double`, `bool→bool`, `string→string`, `T[]→T[]`. Commit.

Each task MUST include a golden fixture and assert the assembled source equals it.

---

## Phase C — Judge integration

### Task 12: Assembly entry point

**Files:** Create `src/lib/judge/function-judging/assemble.ts`; Test `tests/unit/judge/function-judging/assemble.test.ts`.

- [ ] **Step 1: failing test**

```ts
import { describe, expect, it } from "vitest";
import { assembleFunctionSubmission } from "@/lib/judge/function-judging/assemble";

const spec = { functionName: "f", params: [{ name: "x", type: "int" as const }], returnType: "int" as const, enabledLanguages: ["python"] };

it("delegates to the language adapter and returns source + offset", () => {
  const r = assembleFunctionSubmission(spec, "python", "class Solution:\n    def f(self, x):\n        return x\n");
  expect(r.source).toContain("Solution().f(*args)");
  expect(r.preludeLineCount).toBeGreaterThan(0);
});
it("throws for an unsupported language", () => {
  expect(() => assembleFunctionSubmission(spec, "brainfuck", "x")).toThrow();
});
```

- [ ] **Step 2: run → FAIL. Step 3: implement**

```ts
// src/lib/judge/function-judging/assemble.ts
import { getAdapter } from "./registry";
import type { FunctionSpec } from "./types";

export function assembleFunctionSubmission(spec: FunctionSpec, language: string, studentCode: string) {
  return getAdapter(language).assemble(spec, studentCode);
}
```

- [ ] **Step 4: run → PASS. Step 5: commit** `feat(judge): ✨ function-submission assembly entry point`.

---

### Task 13: Wire assembly into the judge-claim seam

**Files:** Modify `src/app/api/v1/judge/claim/route.ts` (~L329–347, where `sourceCode` + `testCases` are assembled for the worker response). Test: `tests/unit/api/judge-claim-function.route.test.ts`.

The claim handler already selects the submission’s `sourceCode`, `language`, and the problem’s fields. Add: fetch `problemType` + `functionSpec`; if `problemType === "function"` and a spec exists, replace the outgoing `sourceCode` with `assembleFunctionSubmission(spec, language, sourceCode).source` and stash `preludeLineCount` on the submission row (or a transient map keyed by submission id for error mapping in Task 14). The persisted submission source is unchanged.

- [ ] **Step 1: Write the failing route test** — mock the claim path so a function-type problem with a Python spec yields a worker payload whose `sourceCode` contains `Solution().f(*args)` (i.e. assembly happened), while an `auto` problem passes `sourceCode` through verbatim.
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement the branch** at the payload-assembly site. Guard: only when `supportsFunctionJudging(language)` and spec present; otherwise fall back to verbatim source (defensive — a function problem submitted in an unsupported language should have been blocked at submit time, Task 20).
- [ ] **Step 4: run → PASS; also run the existing judge-claim tests to confirm no regression.**
- [ ] **Step 5: commit** `feat(judge): ✨ assemble function submissions at claim time`.

---

### Task 14: Compile-error line mapping

**Files:** wherever compile output is surfaced to the student (submission result rendering / the field set by the worker callback). Test: `tests/unit/judge/function-judging/error-mapping.test.ts`.

- [ ] **Step 1: failing test** for a pure function `mapCompileError(output, preludeLineCount)` that rewrites `line N` references to `line (N - preludeLineCount)` (never below 1) and leaves non-line text intact.
- [ ] **Step 2: run → FAIL. Step 3: implement** the small pure mapper in `src/lib/judge/function-judging/error-mapping.ts`. **Step 4: run → PASS.**
- [ ] **Step 5: apply** the mapper where compile output is shown for function submissions (respect `showCompileOutput`), add a focused test, **commit** `feat(judge): ✨ student-relative compile errors for function problems`.

---

## Phase D — Authoring API + reference compute

### Task 15: Persist functionSpec + referenceSolution through the problem API

**Files:** Modify `src/lib/validators/problem-management.ts`, `src/lib/problem-management.ts`, `src/app/api/v1/problems/route.ts`, `src/app/api/v1/problems/[id]/route.ts`. Test: `tests/unit/api/problems-function-spec.route.test.ts`.

- [ ] **Step 1: failing test** — POST/PATCH a problem with `problemType:"function"` + a valid `functionSpec` persists it; an invalid spec (bad type, zero params) → 400; `functionSpec` is rejected/ignored when `problemType !== "function"`.
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement** — extend the Zod problem schema with optional `functionSpec` (using `functionSpecSchema` from Task 1) and `referenceSolution` (`{language, source}`); require `functionSpec` when `problemType === "function"` via a `.refine`. Thread through the mutation/read helpers. Strip `referenceSolution` from any student-facing problem read.
- [ ] **Step 4: run → PASS. Step 5: commit** `feat(problems): ✨ persist function spec + reference solution`.

### Task 16: "Compute expected outputs" endpoint

**Files:** Create `src/app/api/v1/problems/[id]/compute-expected/route.ts`. Test: `tests/unit/api/compute-expected.route.test.ts`.

- [ ] **Step 1: failing test** — POST (author-capability gated) with the problem’s reference solution runs each case’s `input` through the judge path using `assembleFunctionSubmission(spec, refLang, refSource)`, returns the produced stdout per case; rejects when no reference solution / not a function problem.
- [ ] **Step 2: run → FAIL. Step 3: implement** — reuse the existing single-run judge mechanism (same one the playground/compiler uses, `src/lib/compiler/execute.ts`) to run the assembled reference against each `input`; collect stdout as `expectedOutput`. Gate on `problems.create`/edit capability + ownership.
- [ ] **Step 4: run → PASS. Step 5: commit** `feat(problems): ✨ compute expected outputs from a reference solution`.

---

## Phase E — Authoring UI

### Task 17: Problem-type "function" + signature builder

**Files:** Create `src/components/problem/function-signature-builder.tsx`; modify `create-problem-form.tsx` (`ProblemType` union + the `problemType` selector ~L666–724) and `messages/{en,ko}.json`. Test: `tests/component/function-signature-builder.test.tsx`.

- [ ] **Step 1: failing component test** — renders function-name input, add/remove parameter rows (name + type `<select>` from `SUPPORTED_FUNCTION_TYPES`), return-type select, enabled-languages multiselect (the 7); emits a valid `FunctionSpec` via `onChange`.
- [ ] **Step 2: run → FAIL. Step 3: implement** the builder + add `"function"` to the `ProblemType` union and the type selector; show the builder only when `problemType === "function"`. **Step 4: run → PASS. Step 5: commit** `feat(problems): ✨ function signature builder`.

### Task 18: Typed function test-case editor

**Files:** Create `src/components/problem/function-test-case-editor.tsx`; wire into `create-problem-form.tsx` (replace the raw stdin/stdout textareas when `problemType==="function"`). Test: `tests/component/function-test-case-editor.test.tsx`.

- [ ] **Step 1: failing test** — for the twoSum spec, renders one typed input per param + an expected-return field per case; on save, serializes to the `test_cases` row shape (`input` = `encodeArgs(...)`, `expectedOutput` = `encodeValue(ret,...)`) using `serialization.ts`; visible/hidden toggle preserved.
- [ ] **Step 2: run → FAIL. Step 3: implement** using the Task 2 encoders. **Step 4: run → PASS. Step 5: commit** `feat(problems): ✨ typed test-case editor for function problems`.

### Task 19: Reference solution editor + compute + stub preview

**Files:** modify the create/edit form. Test: `tests/component/function-reference-solution.test.tsx`.

- [ ] **Step 1: failing test** — language picker + code editor bound to `referenceSolution`; "Compute expected outputs" calls the Task 16 endpoint and fills each case’s expected return; a stub-preview pane shows `getAdapter(lang).generateStub(spec)`.
- [ ] **Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS. Step 5: commit** `feat(problems): ✨ reference solution + compute + stub preview`.

---

## Phase F — Student submit UX

### Task 20: Stub preload + language gating

**Files:** modify `src/lib/judge/code-templates.ts` (function problems pull the stub from the adapter) and the student submit editor (problem detail page). Test: `tests/component/function-submit-stub.test.tsx`.

- [ ] **Step 1: failing test** — for a function problem, the editor preloads `getAdapter(lang).generateStub(spec)` when empty, and the language dropdown lists only `spec.enabledLanguages ∩ FUNCTION_JUDGING_LANGUAGES`.
- [ ] **Step 2: run → FAIL. Step 3: implement.** Add a `getStarterCode(problem, language)` helper that returns the adapter stub for function problems, else `DEFAULT_TEMPLATES[language]`. **Step 4: run → PASS. Step 5: commit** `feat(problems): ✨ function-problem starter stubs + language gating`.

### Task 21: Verify results rendering for function problems

- [ ] **Step 1:** add a focused test asserting per-test verdict rows render for a function submission (visible case shows args/expected/got; hidden shows pass/fail), honoring `showDetailedResults`. If the existing renderer already handles it (it should, since the data shape is unchanged), the test simply pins that. **Commit** `test(problems): ✅ pin function-problem result rendering`.

---

## Phase G — End-to-end + docs

### Task 22: E2E

**Files:** `tests/e2e/function-judging.spec.ts`.

- [ ] Author a function problem (twoSum) with a Python reference solution + compute expected outputs; submit a correct solution → Accepted; submit a wrong solution → Wrong Answer. Run via `npm run test:e2e` against a dev server. **Commit** `test(e2e): ✅ function-judging author→submit→verdict`.

### Task 23: Docs + i18n sweep

- [ ] Update `docs/` (problem-authoring docs) describing the function type + supported types/languages; ensure every new UI string exists in both `messages/en.json` and `messages/ko.json` (run the repo’s i18n catalog-coverage test). **Commit** `docs: 📝 document function-signature judging`.

---

## Self-Review notes
- **Spec coverage:** §2 data model → Task 3/15; §3 registry+adapters → Tasks 4–11; §4 judge integration → Tasks 12–14; §5 authoring → Tasks 15–19; §6 student UX → Tasks 20–21; §7 testing → every task + Task 22; §8 rollout → Task 3 (additive migration), no worker change (Task 13 keeps the worker payload shape).
- **Deferred (spec §6/§10), intentionally NOT in any task:** void/in-place returns, nested/map/ListNode/TreeNode types, unordered/multi-answer comparison, author-supplied unit-test mode, AI generation, stress-testing.
- **Type consistency:** `FunctionSpec`/`FunctionType` (Task 1) used everywhere; adapter method names `generateStub`/`assemble` consistent across Tasks 4–12; `assembleFunctionSubmission` (Task 12) is the single seam consumer (Tasks 13, 16); encoders `encodeArgs`/`encodeValue` (Task 2) used by Tasks 18 + every adapter golden test.
- **Comparison/float caveat (spec §3):** v1 default is exact comparison; double-returning problems should set `comparisonMode=float` and adapters print numbers in a tolerance-compatible form — validate the exact double print format against `judge-worker-rs/src/comparator.rs` during Task 6 and mirror it in every adapter.

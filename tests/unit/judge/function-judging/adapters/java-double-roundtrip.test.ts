import { describe, expect, it } from "vitest";
import { javaAdapter } from "@/lib/judge/function-judging/adapters/java";
import { encodeArgs } from "@/lib/judge/function-judging/serialization";
import type { FunctionSpec } from "@/lib/judge/function-judging/types";
import { jdk } from "../../../../harness/support/toolchain";
import { exec, makeTempDir, writeSource } from "../../../../harness/support/run";

const jdkPaths = jdk();

const spec: FunctionSpec = {
  functionName: "echoDouble",
  params: [{ name: "x", type: "double" }],
  returnType: "double",
  enabledLanguages: ["java"],
};

const SOLUTION = `class Solution {
    double echoDouble(double x) {
        return x;
    }
}
`;

describe.skipIf(!jdkPaths)("java adapter double round-trip precision", () => {
  it("preserves 1.0000000001234567 through serialize + parse", () => {
    const value = 1.0000000001234567;
    const { source } = javaAdapter.assemble(spec, SOLUTION);

    const { dir, cleanup } = makeTempDir("java-double-rt");
    try {
      const file = writeSource(dir, "Main.java", source);
      const outDir = `${dir}/out`;

      const compile = exec(
        jdkPaths!.javac,
        ["--release", "25", "-encoding", "UTF-8", "-d", outDir, file],
        { timeout: 120_000 },
      );
      expect(compile.status, compile.stdout + compile.stderr).toBe(0);

      const run = exec(
        jdkPaths!.java,
        ["-Dfile.encoding=UTF-8", "-cp", outDir, "Main"],
        { input: encodeArgs([value], spec.params) },
      );
      expect(run.error, run.error?.message).toBeUndefined();
      expect(run.status, run.stderr).toBe(0);

      const actual = Number(run.stdout.trim());
      expect(Number.isFinite(actual), `non-finite output: ${run.stdout}`).toBe(
        true,
      );
      const diff = Math.abs(actual - value);
      expect(diff).toBeLessThanOrEqual(1e-9);
    } finally {
      cleanup();
    }
  });
});

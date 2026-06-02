import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string) {
  return readFileSync(join(process.cwd(), p), "utf8");
}

/**
 * Cross-component contract for the IOI partial-score fix (Rust worker + TS server).
 *
 * Bug (multi-agent review 2026-06-03, C1): the worker broke the test loop at the
 * first non-AC verdict and the server computed score = passed / results.length on
 * the TRUNCATED list, inflating IOI partial scores (2/3 instead of 2/10). The fix
 * makes the worker run ALL test cases when the server flags an IOI submission, so
 * the denominator is the true test count. A behavioural test can't span the
 * Rust↔TS boundary, so guard both sides textually.
 */
describe("IOI run-all-test-cases contract (worker + server)", () => {
  it("worker only fail-fast-breaks when run_all_test_cases is false", () => {
    const executor = read("judge-worker-rs/src/executor.rs");
    expect(executor).toContain("!submission.run_all_test_cases");

    const types = read("judge-worker-rs/src/types.rs");
    expect(types).toContain('#[serde(rename = "runAllTestCases", default)]');
    expect(types).toContain("pub run_all_test_cases: bool");
  });

  it("server sets runAllTestCases from the assignment's IOI scoring model", () => {
    const claim = read("src/app/api/v1/judge/claim/route.ts");
    expect(claim).toContain('scoringModel === "ioi"');
    expect(claim).toContain("runAllTestCases");
  });
});

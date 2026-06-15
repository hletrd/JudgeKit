/**
 * Function-Signature Judging E2E Test
 *
 * End-to-end coverage for the `function` problem type (the function-judging
 * feature). An author:
 *   1. creates a `function` problem — twoSum: `int[] nums, int target -> int[]`
 *      with one visible test case (args `[[2,7,11,15],9]`, expected `[0,1]`),
 *      attaching a Python reference solution;
 *   2. computes the expected output from that reference solution via
 *      `POST /api/v1/problems/:id/compute-expected`, then persists the computed
 *      value back onto the test case (mirrors the authoring UI flow);
 *   3. submits a CORRECT Python solution → asserts an `accepted` verdict;
 *   4. submits a WRONG Python solution → asserts a `wrong_answer` verdict.
 *
 * Test-case I/O is stored in the function-judging serialization format:
 *   - `input` is the JSON-encoded argument tuple, e.g. `[[2,7,11,15],9]`.
 *   - `expectedOutput` is the JSON-encoded return value, e.g. `[0,1]`.
 *
 * At judge-claim time the worker source is assembled as
 * `prelude + studentCode + generatedMain`, so the unchanged judge worker
 * judges it like any auto (stdin/stdout) problem.
 *
 * Run (against a dev server with a judge worker + the python language image):
 *   npm run test:e2e -- function-judging
 *   PLAYWRIGHT_BASE_URL=http://localhost:3110 E2E_USERNAME=admin \
 *     E2E_PASSWORD='yourpass' npx playwright test tests/e2e/function-judging.spec.ts
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginWithCredentials } from "./support/helpers";
import { DEFAULT_CREDENTIALS } from "./support/constants";

const CSRF_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
};

const suffix = `e2e-${Date.now()}`;
const problemTitle = `[E2E] twoSum Function ${suffix}`;

// Function spec: `int[] nums, int target -> int[]`. Python is one of the seven
// languages supported by function judging (python, cpp23, javascript,
// typescript, java, go, csharp).
const FUNCTION_SPEC = {
  functionName: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returnType: "int[]",
  enabledLanguages: ["python"],
} as const;

// Reference solution (author-only). Implements the `Solution.twoSum` method the
// Python harness adapter invokes. Used by compute-expected to derive the
// canonical expected output.
const REFERENCE_SOLUTION = {
  language: "python",
  source: `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, v in enumerate(nums):
            if target - v in seen:
                return [seen[target - v], i]
            seen[v] = i
        return []
`,
} as const;

// Serialized test case: args `[[2,7,11,15],9]` -> expected `[0,1]`.
// `input` is the JSON-encoded argument tuple; `expectedOutput` starts as a
// placeholder and is replaced by the compute-expected result below.
const TEST_CASE_INPUT = "[[2,7,11,15],9]";
const TEST_CASE_EXPECTED = "[0,1]";

// Correct student solution: same algorithm, returns the matching indices.
const CORRECT_SOLUTION = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, v in enumerate(nums):
            if target - v in seen:
                return [seen[target - v], i]
            seen[v] = i
        return []
`;

// Wrong student solution: always returns [0, 0], which does not match [0,1].
const WRONG_SOLUTION = `class Solution:
    def twoSum(self, nums, target):
        return [0, 0]
`;

// Shared state across serial steps.
let adminPage: Page;
let adminRequest: APIRequestContext;
let problemId: string;

async function loginAsAdmin(page: Page) {
  await loginWithCredentials(
    page,
    DEFAULT_CREDENTIALS.username,
    DEFAULT_CREDENTIALS.password,
    { allowPasswordChange: true },
  );
  if (page.url().includes("/change-password")) {
    await page.locator("#currentPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#newPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.locator("#confirmPassword").fill(DEFAULT_CREDENTIALS.password);
    await page.getByRole("button", { name: /Change Password|비밀번호 변경/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }
}

async function apiPost(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
) {
  const res = await request.post(path, { data, headers: CSRF_HEADERS });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) {
    throw new Error(`API POST ${path} failed (${res.status()}): ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Poll a submission until judging reaches a terminal status.
 */
async function waitForSubmissionVerdict(
  request: APIRequestContext,
  submissionId: string,
  timeoutMs = 120_000,
): Promise<{ status: string; score: number; compileOutput: string }> {
  const terminalStatuses = new Set([
    "accepted",
    "wrong_answer",
    "time_limit",
    "memory_limit",
    "runtime_error",
    "compile_error",
  ]);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`/api/v1/submissions/${submissionId}`);
    if (res.ok()) {
      const json = await res.json();
      const data = json.data ?? json;
      if (terminalStatuses.has(data.status)) {
        return {
          status: data.status,
          score: Number(data.score ?? 0),
          compileOutput: data.compileOutput ?? "",
        };
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw new Error(`Submission ${submissionId} did not finish within ${timeoutMs}ms`);
}

test.describe.serial("Function-Signature Judging", () => {
  test("Step 1: Admin login", async ({ browser }) => {
    adminPage = await browser.newPage();
    await loginAsAdmin(adminPage);
    adminRequest = adminPage.request;
    expect(adminPage.url()).toContain("/dashboard");
  });

  test("Step 2: Create a function problem with a Python reference solution", async () => {
    const res = await apiPost(adminRequest, "/api/v1/problems", {
      title: problemTitle,
      description:
        "Given an array of integers `nums` and an integer `target`, return the " +
        "indices of the two numbers that add up to `target`.",
      problemType: "function",
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      visibility: "public",
      comparisonMode: "exact",
      functionSpec: FUNCTION_SPEC,
      referenceSolution: REFERENCE_SOLUTION,
      testCases: [
        {
          input: TEST_CASE_INPUT,
          // Placeholder expected output; replaced by compute-expected below.
          expectedOutput: TEST_CASE_EXPECTED,
          isVisible: true,
          sortOrder: 0,
        },
      ],
    });
    problemId = res.data.id;
    expect(problemId).toBeTruthy();
    expect(res.data.problemType).toBe("function");
    // The reference solution must never be exposed on a student-facing read,
    // but it is persisted; functionSpec drives the student's stub.
    expect(res.data.functionSpec).toMatchObject({ functionName: "twoSum" });
  });

  test("Step 3: Compute expected output from the reference solution", async () => {
    const res = await apiPost(
      adminRequest,
      `/api/v1/problems/${problemId}/compute-expected`,
      {},
    );
    const results: Array<{
      testCaseIndex: number;
      input: string;
      expectedOutput: string;
      ok: boolean;
      error?: string;
    }> = res.data.results;

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);

    const first = results[0];
    expect(first.ok, `compute-expected error: ${first.error ?? ""}`).toBe(true);
    // The reference solution returns [0, 1] for these args; the harness encodes
    // it as compact JSON.
    expect(first.expectedOutput).toBe(TEST_CASE_EXPECTED);

    // Persist the computed expected output back onto the test case — exactly
    // what the authoring UI does after compute-expected succeeds.
    const patchRes = await adminRequest.patch(`/api/v1/problems/${problemId}`, {
      data: {
        testCases: [
          {
            input: TEST_CASE_INPUT,
            expectedOutput: first.expectedOutput,
            isVisible: true,
            sortOrder: 0,
          },
        ],
      },
      headers: CSRF_HEADERS,
    });
    expect([200, 204]).toContain(patchRes.status());
  });

  test("Step 4: Correct submission is Accepted", async () => {
    test.setTimeout(150_000);
    const subRes = await apiPost(adminRequest, "/api/v1/submissions", {
      problemId,
      language: "python",
      sourceCode: CORRECT_SOLUTION,
    });
    const submissionId = subRes.data.id;
    expect(submissionId).toBeTruthy();

    const verdict = await waitForSubmissionVerdict(adminRequest, submissionId);
    const diagnostic = [
      `Status: ${verdict.status}`,
      `Score: ${verdict.score}`,
      verdict.compileOutput ? `Compile output:\n${verdict.compileOutput.slice(0, 500)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    expect(verdict.status, diagnostic).toBe("accepted");
  });

  test("Step 5: Wrong submission is Wrong Answer", async () => {
    test.setTimeout(150_000);
    const subRes = await apiPost(adminRequest, "/api/v1/submissions", {
      problemId,
      language: "python",
      sourceCode: WRONG_SOLUTION,
    });
    const submissionId = subRes.data.id;
    expect(submissionId).toBeTruthy();

    const verdict = await waitForSubmissionVerdict(adminRequest, submissionId);
    const diagnostic = [
      `Status: ${verdict.status}`,
      `Score: ${verdict.score}`,
      verdict.compileOutput ? `Compile output:\n${verdict.compileOutput.slice(0, 500)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    expect(verdict.status, diagnostic).toBe("wrong_answer");
  });

  test("Step 6: Cleanup — delete problem and close page", async () => {
    if (problemId) {
      await adminRequest.delete(`/api/v1/problems/${problemId}?force=true`, {
        headers: CSRF_HEADERS,
      });
    }
    await adminPage?.close();
  });
});

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { BASE_URL, DEFAULT_CREDENTIALS as CREDENTIALS } from "./support/constants";

const OUTPUT_ONLY_CASE = {
  input: "",
  expectedOutput: "Hello, JudgeKit!\n",
};

const OUTPUT_ONLY_SOLUTIONS: Record<string, string> = {
  plaintext: "Hello, JudgeKit!\n",
  verilog: `module solution;
initial begin
  $display("Hello, JudgeKit!");
end
endmodule
`,
  systemverilog: `module solution;
initial begin
  $display("Hello, JudgeKit!");
end
endmodule
`,
  vhdl: `entity solution is
end solution;

architecture beh of solution is
begin
  process
  begin
    report "Hello, JudgeKit!";
    wait;
  end process;
end beh;
`,
};

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "load" });
  await page.locator("#username").fill(CREDENTIALS.username);
  await page.locator("#password").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /sign in|로그인|signing/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 60_000 });

  if (page.url().includes("/change-password")) {
    throw new Error("Account requires password change");
  }
}

async function apiPost(ctx: BrowserContext, path: string, body: unknown) {
  return ctx.request.post(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    data: body,
  });
}

async function apiDelete(ctx: BrowserContext, path: string) {
  return ctx.request.delete(`${BASE_URL}${path}`, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });
}

async function apiGet(ctx: BrowserContext, path: string) {
  return ctx.request.get(`${BASE_URL}${path}`);
}

async function waitForJudging(
  ctx: BrowserContext,
  submissionId: string,
  timeoutMs = 60_000
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
    const response = await apiGet(ctx, `/api/v1/submissions/${submissionId}`);
    if (response.status() === 200) {
      const json = await response.json();
      const data = json.data ?? json;
      if (terminalStatuses.has(data.status)) {
        return {
          status: data.status,
          score: Number(data.score ?? 0),
          compileOutput: data.compileOutput ?? "",
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Submission ${submissionId} did not finish within ${timeoutMs}ms`);
}

test.describe("output-only languages", () => {
  let ctx: BrowserContext;
  let problemId = "";

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);

    const listRes = await apiGet(ctx, "/api/v1/problems");
    if (listRes.status() === 200) {
      const listJson = await listRes.json();
      const problems: Array<{ id: string; title: string }> =
        listJson.data?.problems ?? listJson.data ?? listJson.problems ?? [];
      const existing = problems.find((problem) => problem.title.includes("[E2E] Output-only Languages"));
      if (existing) {
        await apiDelete(ctx, `/api/v1/problems/${existing.id}`);
      }
    }

    const createRes = await apiPost(ctx, "/api/v1/problems", {
      title: `[E2E] Output-only Languages — ${Date.now()}`,
      description: "Print the expected output exactly once.",
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      visibility: "public",
      testCases: [{ ...OUTPUT_ONLY_CASE, isVisible: true, sortOrder: 0 }],
    });
    expect(createRes.status()).toBe(201);
    problemId = (await createRes.json()).data?.id ?? "";
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  for (const [language, sourceCode] of Object.entries(OUTPUT_ONLY_SOLUTIONS)) {
    test(language, async () => {
      test.setTimeout(90_000);
      expect(problemId).not.toBe("");

      const submitRes = await apiPost(ctx, "/api/v1/submissions", {
        problemId,
        language,
        sourceCode,
      });

      const submitStatus = submitRes.status();
      const submitJson = submitStatus === 201 ? await submitRes.json() : null;
      const submitError = submitStatus === 201 ? "" : await submitRes.text();

      expect(submitStatus, submitError).toBe(201);
      const submissionId = submitJson?.data?.id as string;

      const result = await waitForJudging(ctx, submissionId);
      expect(result.status, result.compileOutput).toBe("accepted");
      expect(result.score).toBe(100);
    });
  }
});

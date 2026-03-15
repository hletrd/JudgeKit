import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { BASE_URL, DEFAULT_CREDENTIALS as CREDENTIALS } from "./support/constants";

// A+B solutions for every supported language
const SOLUTIONS: Record<string, string> = {
  c17: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  c23: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  cpp20: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  cpp23: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  java: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt(), b = sc.nextInt();
        System.out.println(a + b);
    }
}`,
  python: `a, b = map(int, input().split())
print(a + b)`,
  javascript: `process.stdin.resume();
process.stdin.setEncoding('utf8');
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
    const [a, b] = d.trim().split(/\\s+/).map(Number);
    console.log(a + b);
});`,
  typescript: `process.stdin.resume();
process.stdin.setEncoding('utf8');
let d = '';
process.stdin.on('data', (c: string) => d += c);
process.stdin.on('end', () => {
    const [a, b] = d.trim().split(/\\s+/).map(Number);
    console.log(a + b);
});`,
  kotlin: `fun main() {
    val (a, b) = readLine()!!.split(" ").map { it.toInt() }
    println(a + b)
}`,
  rust: `use std::io;
fn main() {
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    let nums: Vec<i64> = input.trim().split_whitespace()
        .map(|x| x.parse().unwrap()).collect();
    println!("{}", nums[0] + nums[1]);
}`,
  go: `package main
import "fmt"
func main() {
    var a, b int
    fmt.Scan(&a, &b)
    fmt.Println(a + b)
}`,
  swift: `let parts = readLine()!.split(separator: " ").map { Int($0)! }
print(parts[0] + parts[1])`,
  csharp: `using System;
class Program {
    static void Main() {
        var parts = Console.ReadLine().Split();
        Console.WriteLine(int.Parse(parts[0]) + int.Parse(parts[1]));
    }
}`,
  r: `x <- as.integer(strsplit(readLines("stdin", 1), " ")[[1]])
cat(x[1] + x[2], "\\n")`,
  perl: `my ($a, $b) = split / /, <STDIN>;
print $a + $b, "\\n";`,
  php: `<?php
list($a, $b) = explode(" ", trim(fgets(STDIN)));
echo $a + $b . "\\n";`,
  clang_c23: `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}`,
  clang_cpp23: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`,
  whitespace: [
    // Whitespace A+B: push 0, readnum, push 1, readnum, push 0, retrieve, push 1, retrieve, add, printnum, end
    // IMP: S=stack, TS=arith, TT=heap, TL=io, L=flow
    // Push 0:    SS S\\n     (stack push, number = +0)
    // ReadNum:   TL TT       (io read-number to heap)
    // Push 1:    SS ST\\n    (stack push, number = +1)
    // ReadNum:   TL TT
    // Push 0:    SS S\\n
    // Retrieve:  TT T        (heap retrieve)
    // Push 1:    SS ST\\n
    // Retrieve:  TT T
    // Add:       TS SS       (arith add)
    // PrintNum:  TL ST       (io print-number)
    // Push 10:   SS STSTS\\n (stack push, number = +10 = newline)
    // PrintChar: TL SS       (io print-char)
    // End:       LLL         (flow end)
    "   \\n",     // push 0
    "\\t\\n\\t\\t",   // readnum -> heap[0]
    "   \\t\\n",  // push 1
    "\\t\\n\\t\\t",   // readnum -> heap[1]
    "   \\n",     // push 0
    "\\t\\t\\t",      // retrieve heap[0]
    "   \\t\\n",  // push 1
    "\\t\\t\\t",      // retrieve heap[1]
    "\\t   ",     // add
    "\\t\\n \\t", // print number
    "   \\t \\t \\n", // push 10 (newline)
    "\\t\\n  ",   // print char
    "\\n\\n\\n",  // end
  ].join(""),
  befunge: `&&+.@`,
  rockstar: `Listen to A
Listen to B
Shout A plus B`,
  shakespeare: `The Sum of Two Numbers.

Romeo, a young man.
Juliet, a lovely woman.
The Ghost, a quiet spirit.

Act I: The Sum.
Scene I: Input and Output.

[Enter Romeo and Juliet]

Juliet:
 Listen to your heart.

[Exit Romeo]
[Enter The Ghost]

Juliet:
 Listen to your heart.

[Exit The Ghost]
[Enter Romeo]

Juliet:
 You are the sum of yourself and The Ghost.
 Open your heart.

[Exeunt]`,
  aheui: `방방다망하`,
  hyeong: `혀엉...혀엉....형타형타`,
};

const TEST_CASES = [
  { input: "1 2", expectedOutput: "3" },
  { input: "0 0", expectedOutput: "0" },
  { input: "-5 10", expectedOutput: "5" },
  { input: "1000000 2000000", expectedOutput: "3000000" },
];

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(CREDENTIALS.username);
  await page.locator("#password").fill(CREDENTIALS.password);
  await page.getByRole("button", { name: /sign in|로그인/i }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 15_000 });

  if (page.url().includes("/change-password")) {
    throw new Error("Account requires password change");
  }

  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
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

async function apiGet(ctx: BrowserContext, path: string) {
  return ctx.request.get(`${BASE_URL}${path}`);
}

async function waitForJudging(
  ctx: BrowserContext,
  submissionId: string,
  timeoutMs = 120_000
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
      const status = data.status;
      if (terminalStatuses.has(status)) {
        return {
          status,
          score: Number(data.score ?? 0),
          compileOutput: data.compileOutput ?? "",
        };
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw new Error(`Submission ${submissionId} did not finish within ${timeoutMs}ms`);
}

test("submit A+B in all 24 languages and verify judging", async ({ browser }) => {
  test.setTimeout(600_000); // 10 minutes total

  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await login(page);
  console.log("Logged in successfully");

  // Reuse an existing [E2E] A+B problem if available, otherwise create one
  let problemId: string | undefined;

  const listRes = await apiGet(context, "/api/v1/problems");
  if (listRes.status() === 200) {
    const listJson = await listRes.json();
    const problems: Array<{ id: string; title: string }> =
      listJson.data?.problems ?? listJson.data ?? listJson.problems ?? [];
    const existing = problems.find((p) => p.title.includes("[E2E] A+B"));
    if (existing) {
      problemId = existing.id;
      console.log(`Reusing existing problem: ${problemId}`);
    }
  }

  if (!problemId) {
    const problemBody = {
      title: `[E2E] A+B All Languages — ${Date.now()}`,
      description: "Read two integers A and B from stdin, print A+B.",
      timeLimitMs: 10000,
      memoryLimitMb: 512,
      visibility: "public",
      testCases: TEST_CASES.map((tc, i) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isVisible: true,
        sortOrder: i,
      })),
    };

    let createRes;
    for (let attempt = 1; attempt <= 3; attempt++) {
      createRes = await apiPost(context, "/api/v1/problems", problemBody);
      if (createRes.status() !== 429) break;
      console.log(`Problem creation rate-limited (attempt ${attempt}), waiting 5s…`);
      await new Promise((r) => setTimeout(r, 5_000));
    }

    expect(createRes!.status()).toBe(201);
    problemId = (await createRes!.json()).data?.id;
    console.log(`Created problem: ${problemId}`);
  }

  // Submit all languages and collect results
  type Result = {
    language: string;
    submissionId: string;
    status: string;
    score: number;
    compileOutput: string;
  };

  const results: Result[] = [];
  const languages = Object.keys(SOLUTIONS);

  for (const language of languages) {
    try {
      // Submit with rate-limit retry
      let subRes!: Awaited<ReturnType<typeof apiPost>>;
      for (let attempt = 1; attempt <= 3; attempt++) {
        subRes = await apiPost(context, "/api/v1/submissions", {
          problemId,
          language,
          sourceCode: SOLUTIONS[language],
        });
        if (subRes.status() !== 429) break;
        console.log(`[${language}] Rate limited (attempt ${attempt}), waiting 15s…`);
        await new Promise((r) => setTimeout(r, 15_000));
      }

      if (subRes.status() !== 201) {
        const err = await subRes.text();
        console.log(`[${language}] Submit failed: ${subRes.status()} ${err}`);
        results.push({
          language,
          submissionId: "-",
          status: `submit_error_${subRes.status()}`,
          score: 0,
          compileOutput: err,
        });
        continue;
      }

      const submissionId = (await subRes.json()).data?.id;
      console.log(`[${language}] Submitted: ${submissionId}`);

      // Wait for result
      const result = await waitForJudging(context, submissionId);
      console.log(
        `[${language}] ${result.status} (score: ${result.score})${
          result.compileOutput ? ` — ${result.compileOutput.slice(0, 120)}` : ""
        }`
      );

      results.push({ language, submissionId, ...result });

      // Brief pause between submissions to avoid rate limiting
      await new Promise((r) => setTimeout(r, 8000));
    } catch (e) {
      console.log(`[${language}] Error: ${e}`);
      results.push({
        language,
        submissionId: "-",
        status: "test_error",
        score: 0,
        compileOutput: String(e),
      });
    }
  }

  // Print summary table
  console.log("\n========== RESULTS SUMMARY ==========");
  console.log("Language       | Status         | Score");
  console.log("---------------|----------------|------");
  for (const r of results) {
    const lang = r.language.padEnd(14);
    const status = r.status.padEnd(15);
    console.log(`${lang} | ${status} | ${r.score}`);
  }

  const accepted = results.filter((r) => r.status === "accepted");
  const failed = results.filter((r) => r.status !== "accepted");
  console.log(`\nAccepted: ${accepted.length}/${results.length}`);

  if (failed.length > 0) {
    console.log("\nFailed languages:");
    for (const r of failed) {
      console.log(`  ${r.language}: ${r.status}`);
      if (r.compileOutput) {
        console.log(`    → ${r.compileOutput.slice(0, 200)}`);
      }
    }
  }
  console.log("=====================================\n");

  // Take a final screenshot of the problem page
  await page.goto(`${BASE_URL}/dashboard/problems/${problemId}`, {
    waitUntil: "networkidle",
  });

  // Assert all passed
  expect(
    failed.map((r) => `${r.language}: ${r.status}`),
    "Some languages failed judging"
  ).toEqual([]);

  await page.close();
  await context.close();
});
